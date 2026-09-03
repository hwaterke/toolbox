import {describe, expect, test} from 'vitest'
import {RULES, ruleById} from '../src/lib/rules/index.ts'
import type {Severity} from '../src/lib/rules/types.ts'

/**
 * The rule table, copied from the spec and from the README it becomes. If a
 * rule is added, renamed or re-graded, this list is the other half of the
 * change — the test fails until both agree.
 */
const TABLE: [string, Severity][] = [
  ['root-file', 'error'],
  ['root-unknown-folder', 'info'],
  ['person-folder-empty', 'error'],
  ['person-folder-media', 'error'],
  ['person-folder-unknown', 'info'],
  ['event-name-format', 'error'],
  ['event-name-date', 'error'],
  ['event-name-case', 'warning'],
  ['event-unknown-entry', 'error'],
  ['event-footage-missing', 'warning'],
  ['footage-layout-mixed', 'error'],
  ['source-folder-case', 'warning'],
  ['source-folder-nesting', 'warning'],
  ['missing-date-prefix', 'warning'],
  ['unrecognised-file', 'warning'],
  ['sidecar-file', 'warning'],
  ['bucket-not-mirrored', 'error'],
  ['bucket-orphan-folder', 'error'],
  ['bucket-non-raw', 'error'],
  ['raw-orphan', 'error'],
  ['raw-loose-pair', 'warning'],
  ['raw-ambiguous-pair', 'warning'],
  ['sorted-year-folder', 'error'],
  ['sorted-month-folder', 'error'],
  ['sorted-year-file', 'error'],
  ['sorted-month-entry', 'error'],
  ['sorted-bucket-nesting', 'error'],
  ['media-before-event', 'warning'],
]

describe('the rule registry', () => {
  test('holds every rule in the table, and no others', () => {
    const registered = RULES.map((rule) => rule.id).sort()
    const expected = TABLE.map(([id]) => id).sort()
    expect(registered).toStrictEqual(expected)
  })

  test('grades each rule as the table does', () => {
    const graded = TABLE.map(([id]) => [id, ruleById(id)?.severity])
    expect(graded).toStrictEqual(TABLE)
  })

  test('has no duplicate ids', () => {
    const ids = RULES.map((rule) => rule.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('gives every rule a title', () => {
    for (const rule of RULES) {
      expect([rule.id, rule.title.length > 0]).toStrictEqual([rule.id, true])
    }
  })

  test('finds a rule by id, and nothing by an unknown one', () => {
    expect(ruleById('raw-orphan')?.id).toBe('raw-orphan')
    expect(ruleById('no-such-rule')).toBeUndefined()
  })
})
