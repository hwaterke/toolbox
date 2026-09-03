import {splitStem} from '@hwaterke/file-utils'
import {EVENT_ENTRIES, MEDIA_EXT_SET} from '../constants.ts'
import {parseTimestampedName} from '../names.ts'
import {isPascalCase, isRealDate, parseEventName} from '../validation.ts'
import type {Rule} from './types.ts'

const SECONDS_PER_DAY = 86_400

/** The UTC midnight starting the day a timestamp falls in. */
const dayOf = (epochSeconds: number): number =>
  Math.floor(epochSeconds / SECONDS_PER_DAY) * SECONDS_PER_DAY

const EVENT_ENTRY_SET: ReadonlySet<string> = new Set(EVENT_ENTRIES)

/**
 * Shape only. A name that fails here is not reported again by
 * `event-name-date` or `event-name-case`, which both need the parsed fields.
 */
export const eventNameFormat: Rule = {
  id: 'event-name-format',
  severity: 'error',
  title: 'Event name is not YYYY-MM-DD-Name',
  check: (scope) =>
    scope.kind === 'event' && parseEventName(scope.name) === null
      ? [{path: scope.path}]
      : [],
}

/** The gap `isValidEventName` used to leave open: `2025-02-30-Trip` (T5). */
export const eventNameDate: Rule = {
  id: 'event-name-date',
  severity: 'error',
  title: 'Event date is not a real calendar date',
  check: (scope) => {
    if (scope.kind !== 'event') {
      return []
    }
    const parsed = parseEventName(scope.name)
    if (parsed === null || isRealDate(parsed.year, parsed.month, parsed.day)) {
      return []
    }
    return [{path: scope.path, detail: 'no such day'}]
  },
}

/** Style, so a warning: 94 of 314 folders are Train-Case or start lower-case. */
export const eventNameCase: Rule = {
  id: 'event-name-case',
  severity: 'warning',
  title: 'Event name is not PascalCase',
  check: (scope) => {
    if (scope.kind !== 'event') {
      return []
    }
    const parsed = parseEventName(scope.name)
    if (parsed === null || isPascalCase(parsed.title)) {
      return []
    }
    return [{path: scope.path, detail: parsed.title}]
  },
}

/** An event holds `footage/`, `assets/`, `exports/` and `README.md`, nothing else. */
export const eventUnknownEntry: Rule = {
  id: 'event-unknown-entry',
  severity: 'error',
  title:
    'Entry in an event other than footage/, assets/, exports/ or README.md',
  check: (scope) =>
    scope.kind === 'event'
      ? scope.entries
          .filter((entry) => !EVENT_ENTRY_SET.has(entry.name))
          .map((entry) => ({path: entry.path}))
      : [],
}

/**
 * A warning, not an error: `footage/` is usually but not always present — four
 * events are exports or assets only.
 */
export const eventFootageMissing: Rule = {
  id: 'event-footage-missing',
  severity: 'warning',
  title: 'Event has no footage/',
  check: (scope) =>
    scope.kind === 'event' && scope.footage === null
      ? [{path: scope.path}]
      : [],
}

/**
 * A file dated well before the event it sits in was usually filed into the
 * wrong one. A day of slack absorbs the evening-before shot and a camera still
 * set to the previous timezone, so only earlier dates are reported — a file
 * *after* the event date is just a multi-day event.
 *
 * Only timestamped media is judged; a file with no prefix is
 * `missing-date-prefix`'s to report, and there is no date to compare anyway.
 */
export const mediaBeforeEvent: Rule = {
  id: 'media-before-event',
  severity: 'warning',
  title: 'Media dated before its event',
  check: (scope, context) => {
    if (scope.kind !== 'event' || scope.footage === null) {
      return []
    }
    const parsed = parseEventName(scope.name)
    if (parsed === null || !isRealDate(parsed.year, parsed.month, parsed.day)) {
      return []
    }
    const eventDay = Date.UTC(parsed.year, parsed.month - 1, parsed.day) / 1000

    const reports = []
    for (const file of scope.footage.files) {
      const {stem, ext} = splitStem(file.name)
      if (!MEDIA_EXT_SET.has(ext)) {
        continue
      }
      const timestamp = parseTimestampedName(stem)
      if (timestamp === null) {
        continue
      }
      const daysEarly =
        (eventDay - dayOf(timestamp.epochSeconds)) / SECONDS_PER_DAY
      if (daysEarly > context.maxDaysEarly) {
        reports.push({
          path: file.path,
          detail: `${daysEarly} day(s) before ${scope.name}`,
        })
      }
    }
    return reports
  },
}

/** The event-shape rules, in report order. */
export const eventRules: readonly Rule[] = [
  eventNameFormat,
  eventNameDate,
  eventNameCase,
  eventUnknownEntry,
  eventFootageMissing,
  mediaBeforeEvent,
]
