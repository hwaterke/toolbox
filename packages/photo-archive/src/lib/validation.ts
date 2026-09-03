import {BUCKET} from './constants.ts'

/** Split a path on either separator, dropping empty components. */
function pathComponents(p: string): string[] {
  return p.split(/[\\/]+/).filter((part) => part !== '')
}

/**
 * True when `raw_versions` appears as an exact path component. A folder merely
 * ending in the name (e.g. `footage_raw_versions`) does NOT count.
 */
export function isInsideBucket(p: string): boolean {
  return pathComponents(p).includes(BUCKET)
}

export type EventName = {
  year: number
  month: number
  day: number
  /** The part after the date, which may itself contain dashes. */
  title: string
}

/**
 * Split `YYYY-MM-DD-Name` into its fields. Shape only: the date is not checked
 * here, so `lint` can tell a malformed name (`event-name-format`) apart from a
 * well-formed impossible one (`event-name-date`).
 */
export function parseEventName(name: string): EventName | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})-(.+)$/.exec(name)
  if (match === null) {
    return null
  }
  return {
    year: Number(match[1]!),
    month: Number(match[2]!),
    day: Number(match[3]!),
    title: match[4]!,
  }
}

/**
 * Event folder names are `YYYY-MM-DD-Name`, with a non-empty name that may
 * itself contain dashes (decision 15), and a date that really exists. Feb 30
 * and Nov 31 are rejected here, not just out-of-range fields (T5).
 */
export function isValidEventName(name: string): boolean {
  const parsed = parseEventName(name)
  if (parsed === null) {
    return false
  }
  return isRealDate(parsed.year, parsed.month, parsed.day)
}

/**
 * `Iceland`, `SicilyDay2` — an upper-case letter, then letters and digits only.
 * `Train-Case`, a lower-case start and a leading digit all fail, which is why
 * the rule is a warning: 94 of 314 event folders do not comply yet.
 */
export function isPascalCase(value: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(value)
}

/**
 * True when year/month/day name a day that exists. Uses the same `Date.UTC`
 * round-trip as `parseTimestampedName`: `Date.UTC` silently rolls Feb 30 over
 * into March, so a date survives only if it comes back unchanged.
 */
export function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false
  }
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

/**
 * `--source` must be a single safe path segment: `dji`, `iphone-aline`. No
 * separator, no `..`, no leading dot, no whitespace-only value (T5).
 */
export function isValidSourceSegment(source: string): boolean {
  if (source === '' || source.trim() !== source) {
    return false
  }
  if (source.startsWith('.')) {
    return false
  }
  if (/[\\/]/.test(source) || source.includes('\0')) {
    return false
  }
  return source !== '..' && source !== '.'
}

export type SourceRejection =
  'is_archive_root' | 'inside_events' | 'inside_sorted' | 'inside_bucket'

/**
 * Decision 28: the source folder may sit inside the archive (`to-sort` is the
 * point), but it may not be the archive root itself, and it may not be inside
 * `events/`, `sorted/`, or any `raw_versions/`.
 *
 * Both paths must already be absolute and normalised by the caller. Returns
 * null when the source is acceptable.
 */
export function checkSourceLocation(
  sourcePath: string,
  archiveRoot: string
): SourceRejection | null {
  const source = pathComponents(sourcePath)
  const root = pathComponents(archiveRoot)

  const isUnderRoot =
    source.length >= root.length &&
    root.every((part, index) => source[index] === part)

  if (!isUnderRoot) {
    return null
  }

  const relative = source.slice(root.length)
  if (relative.length === 0) {
    return 'is_archive_root'
  }
  if (relative.includes(BUCKET)) {
    return 'inside_bucket'
  }
  if (relative[0] === 'events') {
    return 'inside_events'
  }
  if (relative[0] === 'sorted') {
    return 'inside_sorted'
  }
  return null
}
