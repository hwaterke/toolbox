import {Temporal} from 'temporal-polyfill'

const EXIF_CLOCK_REGEX = /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/
const EXIF_CLOCK_WITH_OFFSET_REGEX =
  /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/

/** `2025:05:09 09:18:14` -> `2025-05-09T09:18:14`. */
const toIsoShape = (clock: string): string =>
  `${clock.slice(0, 10).replaceAll(':', '-')}T${clock.slice(11)}`

const from = (text: string): Temporal.ZonedDateTime | null => {
  try {
    return Temporal.ZonedDateTime.from(text)
  } catch {
    return null
  }
}

/**
 * Reads an exiftool clock time, `yyyy:MM:dd HH:mm:ss`, as a wall clock in
 * `zone`. Returns `null` when the string is not that shape or the clock does
 * not exist, so callers keep their `failed`/`skipped` verdicts.
 */
export const parseExifClock = (
  clock: string,
  zone: string
): Temporal.ZonedDateTime | null =>
  EXIF_CLOCK_REGEX.test(clock) ? from(`${toIsoShape(clock)}[${zone}]`) : null

/**
 * Reads an exiftool clock time that carries its own offset,
 * `yyyy:MM:dd HH:mm:ss+02:00`, keeping that offset as the zone.
 */
export const parseExifClockWithOffset = (
  value: string
): Temporal.ZonedDateTime | null =>
  EXIF_CLOCK_WITH_OFFSET_REGEX.test(value)
    ? from(`${toIsoShape(value)}[${value.slice(-6)}]`)
    : null

/** The offset from UTC in minutes, the unit luxon's `.offset` used. */
export const offsetMinutes = (time: Temporal.ZonedDateTime): number =>
  time.offsetNanoseconds / 60_000_000_000

/**
 * The zone's offset with DST excluded. DST only ever adds time, so the smaller
 * of the two mid-season offsets is the base one. Asking the zone beats
 * assuming "one hour": Lord Howe Island shifts by 30 minutes.
 */
export const baseOffsetMinutes = (time: Temporal.ZonedDateTime): number =>
  Math.min(
    offsetMinutes(time.with({month: 1, day: 15})),
    offsetMinutes(time.with({month: 7, day: 15}))
  )

/** True when the zone is currently a DST step ahead of its base offset. */
export const isInDst = (time: Temporal.ZonedDateTime): boolean =>
  offsetMinutes(time) !== baseOffsetMinutes(time)
