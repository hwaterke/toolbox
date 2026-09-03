import {EVENT_ENTRIES} from '../constants.ts'
import {isPascalCase, isRealDate, parseEventName} from '../validation.ts'
import type {Rule} from './types.ts'

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

/** The event-shape rules, in report order. */
export const eventRules: readonly Rule[] = [
  eventNameFormat,
  eventNameDate,
  eventNameCase,
  eventUnknownEntry,
  eventFootageMissing,
]
