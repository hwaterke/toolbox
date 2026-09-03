import {bucketRules} from './bucket.ts'
import {eventRules} from './event.ts'
import {footageRules} from './footage.ts'
import {rootRules} from './root.ts'
import {sortedRules} from './sorted.ts'
import type {Rule} from './types.ts'

export type {Finding, Rule, RuleContext, RuleReport, Severity} from './types.ts'
export {runRule} from './types.ts'

/**
 * Every rule `lint` runs, grouped by the part of the archive it judges and in
 * report order. The ids are stable: `--rule` names them, and so does the
 * README's rule table.
 */
export const RULES: readonly Rule[] = [
  ...rootRules,
  ...eventRules,
  ...footageRules,
  ...bucketRules,
  ...sortedRules,
]

/** Look one rule up by id, for `--rule`. */
export function ruleById(id: string): Rule | undefined {
  return RULES.find((rule) => rule.id === id)
}
