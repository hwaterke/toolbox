import {
  EXIF_DATE_TIME_FORMAT,
  EXIF_TAGS,
  type ExiftoolMetadata,
} from '@hwaterke/media-probe'
import {DateTime, FixedOffsetZone} from 'luxon'
import nodePath from 'node:path'
import type {Plan} from './plan.ts'

const NIKON_MAKE = 'NIKON CORPORATION'
const NIKON_EXTENSIONS = new Set(['.JPG', '.NEF'])
const OFFSET_REGEX = /^([+-])(\d{2}):(\d{2})$/

export type PlanNikonOptions = {
  path: string
  /** IANA zone. When given it wins over what the camera recorded. */
  zone?: string
  /** Re-express the recorded instant in `zone` instead of skipping. */
  convertZone?: boolean
}

/**
 * What the camera itself says about the time zone.
 *
 * Nikon stores the *base* zone in `MakerNotes:Nikon:TimeZone` with DST
 * excluded, and whether DST applied in `MakerNotes:Nikon:DaylightSavings`.
 * `DateTimeOriginal` is the clock time the camera displayed, DST included.
 */
type CameraZone = {
  /** True offset in minutes, DST included. */
  offsetMinutes: number
  /** Base zone offset in minutes, DST excluded. */
  baseMinutes: number
  daylightSavings: boolean
  /** The file carries the historical bug described in `isDamaged`. */
  damaged: boolean
}

/** A tag we manage: where to read it, how to write it, what it should be. */
type DesiredTag = {
  readTag: string
  writeTag: string
  value: string
}

type TargetZone = {
  clockTime: string
  offsetMinutes: number
  baseMinutes: number
  daylightSavings: boolean
}

type PlanFailure = {verdict: 'skipped' | 'failed'; reason: string}

const offsetToMinutes = (offset: string): number | null => {
  const match = OFFSET_REGEX.exec(offset)
  if (!match) {
    return null
  }
  const [, sign, hours, minutes] = match
  const total = Number(hours) * 60 + Number(minutes)
  return sign === '-' ? -total : total
}

const minutesToOffset = (minutes: number): string => {
  const sign = minutes < 0 ? '-' : '+'
  const absolute = Math.abs(minutes)
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0')
  const rest = String(absolute % 60).padStart(2, '0')
  return `${sign}${hours}:${rest}`
}

/**
 * The zone's offset with DST excluded. DST only ever adds time, so the smaller
 * of the two mid-season offsets is the base one. Asking the zone beats
 * assuming "one hour": Lord Howe Island shifts by 30 minutes.
 */
const baseOffsetMinutes = (dateTime: DateTime): number =>
  Math.min(
    dateTime.set({month: 1, day: 15}).offset,
    dateTime.set({month: 7, day: 15}).offset
  )

/**
 * An older version of this tool wrote a correct `OffsetTimeOriginal` and then
 * also overwrote `Nikon:TimeZone` with it. That is wrong: `Nikon:TimeZone` is
 * the base zone and must stay one DST step behind. Such a file reads back as
 * `OffsetTimeOriginal === Nikon:TimeZone` while `DaylightSavings` is `Yes`,
 * which a camera can never produce - DST being on always widens the gap.
 * With `DaylightSavings` set to `No` the old write was a no-op, so there is
 * nothing to detect and nothing to repair.
 */
const isDamaged = ({
  daylightSavings,
  rawBaseZone,
  existingOffset,
}: {
  daylightSavings: boolean
  rawBaseZone: string
  existingOffset: string | undefined
}): boolean =>
  daylightSavings &&
  existingOffset !== undefined &&
  existingOffset === rawBaseZone

const failed = (reason: string): Plan => ({
  verdict: 'failed',
  reason,
  writes: [],
})

const skipped = (reason: string): Plan => ({
  verdict: 'skipped',
  reason,
  writes: [],
})

/**
 * The sub-second digits, copied verbatim. Never rebuilt from a parsed date:
 * Luxon truncates to milliseconds, which turns GoPro's `0461` into `04`.
 */
const subSecondSuffix = (metadata: ExiftoolMetadata): string => {
  const subSecond = metadata[EXIF_TAGS.SUB_SEC_TIME_ORIGINAL]
  return subSecond === undefined ? '' : `.${String(subSecond)}`
}

/** Returns the camera's zone, `null` when it recorded none, or an error. */
const readCameraZone = (
  metadata: ExiftoolMetadata
): CameraZone | null | string => {
  const rawBaseZone = metadata[EXIF_TAGS.NIKON_TIME_ZONE]
  const rawDaylightSavings = metadata[EXIF_TAGS.NIKON_DAYLIGHT_SAVINGS]

  if (rawBaseZone === undefined && rawDaylightSavings === undefined) {
    return null
  }
  if (rawBaseZone === undefined || rawDaylightSavings === undefined) {
    return 'incomplete Nikon MakerNotes'
  }
  if (rawDaylightSavings !== 'Yes' && rawDaylightSavings !== 'No') {
    return `unreadable Nikon:DaylightSavings ${rawDaylightSavings}`
  }

  const baseMinutes = offsetToMinutes(rawBaseZone)
  if (baseMinutes === null) {
    return `unreadable Nikon:TimeZone ${rawBaseZone}`
  }

  const daylightSavings = rawDaylightSavings === 'Yes'
  if (
    isDamaged({
      daylightSavings,
      rawBaseZone,
      existingOffset: metadata[EXIF_TAGS.EXIF_OFFSET_TIME_ORIGINAL],
    })
  ) {
    // The stored "base" zone is really the true offset. The base zone sits one
    // DST step behind it, and an hour is the only step this file can tell us
    // about.
    return {
      offsetMinutes: baseMinutes,
      baseMinutes: baseMinutes - 60,
      daylightSavings: true,
      damaged: true,
    }
  }

  return {
    offsetMinutes: baseMinutes + (daylightSavings ? 60 : 0),
    baseMinutes,
    daylightSavings,
    damaged: false,
  }
}

const readTargetZone = ({
  clockTime,
  camera,
  zone,
  convertZone,
}: {
  clockTime: string
  camera: CameraZone | null
  zone: string | undefined
  convertZone: boolean
}): TargetZone | PlanFailure => {
  if (zone === undefined) {
    if (camera === null) {
      return {
        verdict: 'skipped',
        reason: 'no Nikon MakerNotes and no --zone, cannot prove the offset',
      }
    }
    return {
      clockTime,
      offsetMinutes: camera.offsetMinutes,
      baseMinutes: camera.baseMinutes,
      daylightSavings: camera.daylightSavings,
    }
  }

  const inZone = DateTime.fromFormat(clockTime, EXIF_DATE_TIME_FORMAT, {zone})
  if (!inZone.isValid) {
    return {
      verdict: 'failed',
      reason: `cannot read ${clockTime} in ${zone}: ${inZone.invalidReason}`,
    }
  }

  if (camera === null || camera.offsetMinutes === inZone.offset) {
    return {
      clockTime,
      offsetMinutes: inZone.offset,
      baseMinutes: baseOffsetMinutes(inZone),
      daylightSavings: inZone.isInDST,
    }
  }

  // "The label was wrong" and "the clock was wrong" look identical in the
  // file, so writing either one is a coin flip. Skip unless told which.
  if (!convertZone) {
    return {
      verdict: 'skipped',
      reason: `camera says ${minutesToOffset(camera.offsetMinutes)} but ${zone} says ${minutesToOffset(inZone.offset)}, use --convert-zone to re-express the instant`,
    }
  }

  // Keep the instant, change how it is expressed. The MakerNotes end up
  // agreeing with `zone`, so a second run sees no disagreement and does
  // nothing - the conversion converges instead of shifting twice.
  const converted = DateTime.fromFormat(clockTime, EXIF_DATE_TIME_FORMAT, {
    zone: FixedOffsetZone.instance(camera.offsetMinutes),
  }).setZone(zone)

  return {
    clockTime: converted.toFormat(EXIF_DATE_TIME_FORMAT),
    offsetMinutes: converted.offset,
    baseMinutes: baseOffsetMinutes(converted),
    daylightSavings: converted.isInDST,
  }
}

/**
 * Decides what a Nikon photo should end up looking like. Pure: it reads
 * metadata and returns arguments, it never touches the file.
 */
export function planNikon(
  metadata: ExiftoolMetadata,
  {path, zone, convertZone = false}: PlanNikonOptions
): Plan {
  if (convertZone && zone === undefined) {
    return failed('--convert-zone needs --zone')
  }

  const extension = nodePath.extname(path).toUpperCase()
  if (!NIKON_EXTENSIONS.has(extension)) {
    return skipped(`unsupported extension ${extension}`)
  }

  if (metadata[EXIF_TAGS.EXIF_MAKE] !== NIKON_MAKE) {
    return skipped('not a Nikon file')
  }

  const clockTime = metadata[EXIF_TAGS.DATE_TIME_ORIGINAL]
  if (clockTime === undefined) {
    return failed('no DateTimeOriginal')
  }

  const camera = readCameraZone(metadata)
  if (typeof camera === 'string') {
    return failed(camera)
  }

  const target = readTargetZone({clockTime, camera, zone, convertZone})
  if ('verdict' in target) {
    return target.verdict === 'skipped'
      ? skipped(target.reason)
      : failed(target.reason)
  }

  const offset = minutesToOffset(target.offsetMinutes)
  const desired: DesiredTag[] = [
    {
      readTag: EXIF_TAGS.EXIF_OFFSET_TIME,
      writeTag: 'OffsetTime',
      value: offset,
    },
    {
      readTag: EXIF_TAGS.EXIF_OFFSET_TIME_ORIGINAL,
      writeTag: 'OffsetTimeOriginal',
      value: offset,
    },
    {
      readTag: EXIF_TAGS.EXIF_OFFSET_TIME_DIGITIZED,
      writeTag: 'OffsetTimeDigitized',
      value: offset,
    },
  ]

  // Only rewrite MakerNotes the camera actually wrote. A file without them has
  // no Nikon maker note block to write into.
  if (camera !== null) {
    desired.push({
      readTag: EXIF_TAGS.NIKON_TIME_ZONE,
      writeTag: 'Nikon:TimeZone',
      value: minutesToOffset(target.baseMinutes),
    })
    if (convertZone) {
      desired.push({
        readTag: EXIF_TAGS.NIKON_DAYLIGHT_SAVINGS,
        writeTag: 'Nikon:DaylightSavings',
        value: target.daylightSavings ? 'Yes' : 'No',
      })
    }
  }

  // Only `--convert-zone` moves the clock. Everything else adds labels.
  if (target.clockTime !== clockTime) {
    desired.push({
      readTag: EXIF_TAGS.DATE_TIME_ORIGINAL,
      writeTag: 'AllDates',
      value: target.clockTime,
    })
  }

  // The NEF's XMP CreateDate is the one tag that can hold the offset, so it is
  // written last: `-AllDates=` would otherwise leave it without one.
  if (extension === '.NEF') {
    desired.push({
      readTag: EXIF_TAGS.XMP_CREATE_DATE,
      writeTag: 'XMP:CreateDate',
      value: `${target.clockTime}${subSecondSuffix(metadata)}${offset}`,
    })
  }

  const writes = desired
    .filter((tag) => String(metadata[tag.readTag] ?? '') !== tag.value)
    .map((tag) => `-${tag.writeTag}=${tag.value}`)

  if (writes.length === 0) {
    return {verdict: 'ok', reason: 'already correct', writes: []}
  }

  return camera?.damaged
    ? {
        verdict: 'repaired',
        reason: `Nikon:TimeZone held the true offset, restoring the base zone ${minutesToOffset(target.baseMinutes)}`,
        writes,
      }
    : {verdict: 'written', reason: `offset ${offset}`, writes}
}
