import {describe, expect, test} from 'vitest'
import type {Scope} from '../src/lib/model.ts'
import {runRule, type Rule} from '../src/lib/rules/types.ts'

const scope: Scope = {
  kind: 'event',
  name: '2025-05-10-Iceland',
  path: '/a/events/2025-05-10-Iceland',
  entries: [],
  footage: null,
  person: null,
}

const context = {maxDaysEarly: 1}

describe('runRule', () => {
  test('labels a report with the rule and the scope', () => {
    const rule: Rule = {
      id: 'event-footage-missing',
      severity: 'warning',
      title: 'Event has no footage/',
      check: (s) => [{path: s.path, detail: 'no footage/'}],
    }

    expect(runRule(rule, scope, context)).toStrictEqual([
      {
        ruleId: 'event-footage-missing',
        severity: 'warning',
        path: '/a/events/2025-05-10-Iceland',
        scope: '2025-05-10-Iceland',
        detail: 'no footage/',
      },
    ])
  })

  test('leaves detail off when the rule gives none', () => {
    const rule: Rule = {
      id: 'root-file',
      severity: 'error',
      title: 'Visible file at the archive root',
      check: () => [{path: '/a/stray.txt'}],
    }

    const [finding] = runRule(rule, scope, context)
    expect(finding).not.toHaveProperty('detail')
  })

  test('a rule with nothing to say yields no findings', () => {
    const rule: Rule = {
      id: 'root-file',
      severity: 'error',
      title: 'Visible file at the archive root',
      check: () => [],
    }

    expect(runRule(rule, scope, context)).toStrictEqual([])
  })
})
