import {describe, expect, test} from 'vitest'
import type {
  EventScope,
  MediaTree,
  Scope,
  ScopeEntry,
} from '../src/lib/model.ts'
import {
  eventFootageMissing,
  eventNameCase,
  eventNameDate,
  eventNameFormat,
  eventRules,
  eventUnknownEntry,
} from '../src/lib/rules/event.ts'
import {runRule, type Rule} from '../src/lib/rules/types.ts'

const context = {maxDaysEarly: 1}

const entry = (
  parent: string,
  name: string,
  isDirectory = true
): ScopeEntry => ({
  name,
  path: `${parent}/${name}`,
  isDirectory,
})

const tree = (path: string): MediaTree => ({
  path,
  entries: [],
  folders: [],
  files: [],
})

const event = (
  name: string,
  extras: {entries?: ScopeEntry[]; footage?: MediaTree | null} = {}
): EventScope => {
  const path = `/archive/events/${name}`
  return {
    kind: 'event',
    name,
    path,
    entries: extras.entries ?? [entry(path, 'footage')],
    footage:
      extras.footage === undefined ? tree(`${path}/footage`) : extras.footage,
    person: null,
  }
}

const paths = (rule: Rule, scope: Scope): string[] =>
  runRule(rule, scope, context).map((finding) => finding.path)

describe('event-name-format', () => {
  test('reports a bare date with no name', () => {
    const scope = event('2019-08-11')
    expect(paths(eventNameFormat, scope)).toStrictEqual([
      '/archive/events/2019-08-11',
    ])
  })

  test('reports a name with no date', () => {
    expect(paths(eventNameFormat, event('Iceland'))).toHaveLength(1)
  })

  test('accepts a name that itself contains dashes', () => {
    expect(
      paths(eventNameFormat, event('2025-05-10-Trip-To-Iceland'))
    ).toStrictEqual([])
  })
})

describe('event-name-date', () => {
  test('rejects Feb 30 and Nov 31', () => {
    expect(paths(eventNameDate, event('2025-02-30-Trip'))).toHaveLength(1)
    expect(paths(eventNameDate, event('2025-11-31-Trip'))).toHaveLength(1)
  })

  test('accepts Feb 29 in a leap year', () => {
    expect(paths(eventNameDate, event('2024-02-29-Trip'))).toStrictEqual([])
  })

  test('leaves a malformed name to event-name-format', () => {
    expect(paths(eventNameDate, event('Iceland'))).toStrictEqual([])
    expect(paths(eventNameFormat, event('Iceland'))).toHaveLength(1)
  })
})

describe('event-name-case', () => {
  test('accepts PascalCase, with digits inside', () => {
    expect(paths(eventNameCase, event('2025-05-10-Iceland'))).toStrictEqual([])
    expect(paths(eventNameCase, event('2025-05-10-SicilyDay2'))).toStrictEqual(
      []
    )
  })

  test('warns on Train-Case, a lower-case start and a leading digit', () => {
    expect(paths(eventNameCase, event('2025-05-10-Train-Case'))).toHaveLength(1)
    expect(paths(eventNameCase, event('2025-05-10-iceland'))).toHaveLength(1)
    expect(paths(eventNameCase, event('2025-05-10-2Days'))).toHaveLength(1)
  })

  test('is a warning and quotes the offending name part', () => {
    const [finding] = runRule(
      eventNameCase,
      event('2025-05-10-Train-Case'),
      context
    )
    expect(finding?.severity).toBe('warning')
    expect(finding?.detail).toBe('Train-Case')
  })

  test('leaves a malformed name to event-name-format', () => {
    expect(paths(eventNameCase, event('Iceland'))).toStrictEqual([])
  })
})

describe('event-unknown-entry', () => {
  test('accepts the four allowed entries and reports the rest', () => {
    const path = '/archive/events/2025-05-10-Iceland'
    const scope = event('2025-05-10-Iceland', {
      entries: [
        entry(path, 'assets'),
        entry(path, 'exports'),
        entry(path, 'footage'),
        entry(path, 'README.md', false),
        entry(path, 'notes.txt', false),
        entry(path, 'raw_versions'),
      ],
    })

    expect(paths(eventUnknownEntry, scope)).toStrictEqual([
      `${path}/notes.txt`,
      `${path}/raw_versions`,
    ])
  })
})

describe('event-footage-missing', () => {
  test('warns when the event has no footage/', () => {
    const path = '/archive/events/2025-05-10-Iceland'
    const scope = event('2025-05-10-Iceland', {
      entries: [entry(path, 'exports')],
      footage: null,
    })

    expect(paths(eventFootageMissing, scope)).toStrictEqual([path])
  })

  test('says nothing when footage/ is there, even if empty', () => {
    expect(
      paths(eventFootageMissing, event('2025-05-10-Iceland'))
    ).toStrictEqual([])
  })
})

describe('every event rule', () => {
  const otherScope: Scope = {
    kind: 'person',
    person: 'sarah',
    path: '/archive/relations/sarah',
    entries: [entry('/archive/relations/sarah', 'notes.txt', false)],
  }

  test('says nothing about a scope of another kind', () => {
    for (const rule of eventRules) {
      expect([rule.id, paths(rule, otherScope)]).toStrictEqual([rule.id, []])
    }
  })

  test('names the event it judged', () => {
    const [finding] = runRule(
      eventNameCase,
      event('2025-05-10-iceland'),
      context
    )
    expect(finding?.scope).toBe('2025-05-10-iceland')
  })
})
