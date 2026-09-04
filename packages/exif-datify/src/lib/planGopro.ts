import {
  EXIF_DATE_TIME_FORMAT,
  EXIF_DATE_TIME_FORMAT_WITH_TZ,
  EXIF_OFFSET_FORMAT,
  EXIF_TAGS,
  type ExiftoolMetadata,
} from '@hwaterke/media-probe'
import {DateTime} from 'luxon'
import nodePath from 'node:path'
import type {Plan} from './plan.ts'

/*
Example GoPro HERO8 Black metadata (straight out of the camera):

exiftool -Time:All -G0:1 -json GH013974.MP4
[{
  "QuickTime:CreateDate": "2026:09:04 07:58:54",
  "QuickTime:ModifyDate": "2026:09:04 07:58:54",
  "QuickTime:Track1:TrackCreateDate": "2026:09:04 07:58:54",
  ... the same value on all five tracks ...
  "QuickTime:GoPro:Model": "HERO8 Black"
}]

exiftool -Time:All -G0:1 -json GOPR3976.GPR
[{
  "EXIF:IFD0:ModifyDate": "2026:09:04 07:59:50",
  "EXIF:ExifIFD:DateTimeOriginal": "2026:09:04 07:59:50",
  "EXIF:ExifIFD:CreateDate": "2016:03:25 15:55:23",
  "EXIF:IFD0:Make": "GoPro"
}]

Note the `.GPR` CreateDate: a firmware date, not a capture time.
*/

const GOPRO_MAKE = 'GoPro'
const VIDEO_EXTENSIONS = new Set(['.MOV', '.MP4'])
const PHOTO_EXTENSIONS = new Set(['.JPG', '.GPR'])

/**
 * The QuickTime date tags we manage, by their bare name. exiftool writes one
 * name across every track at once, so `TrackCreateDate` covers `Track1` to
 * `Track5`. `Keys:CreationDate` is deliberately absent: it is the anchor, not
 * one of the tags checked against it.
 */
const QUICKTIME_DATE_TAGS = [
  'CreateDate',
  'ModifyDate',
  'TrackCreateDate',
  'TrackModifyDate',
  'MediaCreateDate',
  'MediaModifyDate',
]

export type PlanGoproOptions = {
  path: string
  /** IANA zone. Required: a GoPro records no zone of its own. */
  zone: string
}

const failed = (reason: string): Plan => ({
  verdict: 'failed',
  reason,
  writes: [],
})

const ignored = (reason: string): Plan => ({
  verdict: 'ignored',
  reason,
  writes: [],
})

const ok: Plan = {verdict: 'ok', reason: 'already correct', writes: []}

/**
 * Decides what a GoPro video should end up looking like.
 *
 * `QuickTime:Keys:CreationDate` is the anchor: it is the only tag that carries
 * an offset, the camera never writes it, and this tool always does. Every
 * other time tag is then checked against it.
 *
 * The other tags are stored in UTC, per the MP4 spec, which is what
 * `-api QuickTimeUTC` does when handed a value with an offset. The camera
 * instead stores local time there, against the spec.
 *
 * So the anchor's presence is the *only* record of which convention a file
 * follows. Measured on a HERO8 Black: nothing else in the file - not the
 * `QuickTime:GoPro:*` block, not `UserData`, not `MediaDataOffset` - says
 * whether the stored dates are local or UTC, so a file whose anchor was
 * stripped cannot be told apart from a camera-fresh one. Never strip the
 * anchor, and never read its absence as anything but "camera fresh".
 */
const planVideo = (
  metadata: ExiftoolMetadata,
  {zone}: {zone: string}
): Plan => {
  if (metadata[EXIF_TAGS.GOPRO_MODEL] === undefined) {
    return ignored('not a GoPro file')
  }

  const recordedAnchor = metadata[EXIF_TAGS.QUICKTIME_CREATION_DATE]
  const halfWritten = recordedAnchor !== undefined

  const anchor = halfWritten
    ? DateTime.fromFormat(recordedAnchor, EXIF_DATE_TIME_FORMAT_WITH_TZ, {
        setZone: true,
      })
    : DateTime.fromFormat(
        metadata[EXIF_TAGS.QUICKTIME_CREATE_DATE] ?? '',
        EXIF_DATE_TIME_FORMAT,
        {zone}
      )

  if (!anchor.isValid) {
    return failed(
      halfWritten
        ? `unreadable QuickTime:Keys:CreationDate ${recordedAnchor}`
        : `no readable QuickTime:CreateDate to derive the time from`
    )
  }

  const anchorString = anchor.toFormat(EXIF_DATE_TIME_FORMAT_WITH_TZ)
  const storedUtc = anchor.toUTC().toFormat(EXIF_DATE_TIME_FORMAT)

  const writes: string[] = []
  if (recordedAnchor !== anchorString) {
    writes.push(`-QuickTime:Keys:CreationDate=${anchorString}`)
  }

  // Only tags the file already carries: naming an absent one would create it.
  for (const tag of QUICKTIME_DATE_TAGS) {
    const present = Object.entries(metadata).filter(
      ([key, value]) =>
        value !== undefined &&
        key.startsWith('QuickTime:') &&
        key.endsWith(`:${tag}`)
    )
    if (
      present.length > 0 &&
      present.some(([, value]) => value !== storedUtc)
    ) {
      writes.push(`-QuickTime:${tag}=${anchorString}`)
    }
  }

  if (writes.length === 0) {
    return ok
  }

  // `-api QuickTimeUTC` makes exiftool read the offset off each value and store
  // the UTC instant. Without it the offset is dropped and `Keys:CreationDate`
  // is not written at all.
  //
  // Never add `-wm w` here. It forbids creating a tag that does not exist, and
  // the anchor never exists on a fresh GoPro file - so the write is dropped
  // while exiftool still reports `1 image files updated`. That is why the tag
  // names above come from the file's own metadata: nothing here has to be
  // created blind.
  return {
    verdict: halfWritten ? 'repaired' : 'written',
    reason: halfWritten
      ? `time tags disagreed with the CreationDate anchor ${anchorString}`
      : `creation date ${anchorString}`,
    writes: ['-api', 'QuickTimeUTC', ...writes],
  }
}

/**
 * Decides what a GoPro photo should end up looking like: the three offset tags,
 * plus a repair for the `.GPR` firmware date.
 */
const planPhoto = (
  metadata: ExiftoolMetadata,
  {extension, zone}: {extension: string; zone: string}
): Plan => {
  if (metadata[EXIF_TAGS.EXIF_MAKE] !== GOPRO_MAKE) {
    return ignored('not a GoPro file')
  }

  const clockTime = metadata[EXIF_TAGS.DATE_TIME_ORIGINAL]
  if (clockTime === undefined) {
    return failed('no DateTimeOriginal')
  }

  const inZone = DateTime.fromFormat(clockTime, EXIF_DATE_TIME_FORMAT, {zone})
  if (!inZone.isValid) {
    return failed(
      `cannot read ${clockTime} in ${zone}: ${inZone.invalidReason}`
    )
  }

  const offset = inZone.toFormat(EXIF_OFFSET_FORMAT)
  const desired: {readTag: string; writeTag: string; value: string}[] = [
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

  // A `.GPR` ships a firmware date in CreateDate - 2016:03:25 on a 2026 photo.
  // Its DateTimeOriginal is right, so copy that over the junk rather than
  // leave it stamped with a confident offset.
  if (extension === '.GPR') {
    desired.push({
      readTag: EXIF_TAGS.EXIF_CREATE_DATE,
      writeTag: 'EXIF:CreateDate',
      value: clockTime,
    })
  }

  const writes = desired
    .filter((tag) => String(metadata[tag.readTag] ?? '') !== tag.value)
    .map((tag) => `-${tag.writeTag}=${tag.value}`)

  return writes.length === 0
    ? ok
    : {verdict: 'written', reason: `offset ${offset}`, writes}
}

/**
 * Decides what a GoPro file should end up looking like. Pure: it reads
 * metadata and returns arguments, it never touches the file.
 */
export function planGopro(
  metadata: ExiftoolMetadata,
  {path, zone}: PlanGoproOptions
): Plan {
  const extension = nodePath.extname(path).toUpperCase()

  if (VIDEO_EXTENSIONS.has(extension)) {
    return planVideo(metadata, {zone})
  }
  if (PHOTO_EXTENSIONS.has(extension)) {
    return planPhoto(metadata, {extension, zone})
  }
  // `.LRV` and `.THM` land here: counted as ignored, never silently dropped.
  return ignored(`unsupported extension ${extension}`)
}
