export type TimestampedName = {
  epochSeconds: number
  token: string
  year: string
  month: string
}

/**
 * Parse a `YYYY-MM-DD_HH-MM-SS_<token>` stem, as written by `exif-datify
 * rename`. Validates each date/time field and computes the capture time
 * straight from the numeric fields via Date.UTC (no locale/string-parsing
 * ambiguity — two parsed times are only ever compared to each other, so the UTC
 * offset cancels). Returns the epoch seconds, the trailing original-name token
 * and the zero-padded year/month used to build `sorted/YYYY/MM/`, or null if
 * the stem does not match or does not validate.
 */
export function parseTimestampedName(stem: string): TimestampedName | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})_(.+)$/.exec(
    stem
  )
  if (match === null) {
    return null
  }

  const yearPart = match[1]!
  const monthPart = match[2]!
  const token = match[7]!

  const year = Number(yearPart)
  const month = Number(monthPart)
  const day = Number(match[3]!)
  const hour = Number(match[4]!)
  const minute = Number(match[5]!)
  const second = Number(match[6]!)

  if (month < 1 || month > 12) {
    return null
  }
  if (day < 1 || day > 31) {
    return null
  }
  if (hour > 23 || minute > 59 || second > 59) {
    return null
  }

  const ms = Date.UTC(year, month - 1, day, hour, minute, second)
  const date = new Date(ms)
  // Reject impossible calendar dates that Date.UTC silently rolls over (Feb 30).
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return {
    epochSeconds: Math.floor(ms / 1000),
    token,
    year: yearPart,
    month: monthPart,
  }
}
