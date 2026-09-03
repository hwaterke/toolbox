import type {Scope} from '../model.ts'
import {scopeLabel} from '../model.ts'

/**
 * `error` means the structure is wrong. `warning` means style, or a backlog to
 * work through. `info` is neither — something skipped, reported so a typo'd
 * folder is still visible.
 */
export type Severity = 'error' | 'warning' | 'info'

/** What a rule knows beyond the scope it is judging. */
export type RuleContext = {
  /** How many days before its event a media file may be dated. */
  maxDaysEarly: number
}

/** One thing a rule objected to, before the runner labels it. */
export type RuleReport = {
  /** Absolute path of the entry at fault. */
  path: string
  /** Why, when the rule id alone does not say it. */
  detail?: string
}

/**
 * One check over one scope. Rules are pure and synchronous: the scope is
 * already materialised, and a rule that read the disk would break the
 * one-scope-at-a-time walk.
 */
export type Rule = {
  /** Stable, used by `--rule`. */
  id: string
  severity: Severity
  /** One line, printed as the group heading in the report. */
  title: string
  check: (scope: Scope, context: RuleContext) => RuleReport[]
}

/** A rule's objection, labelled with where it came from. */
export type Finding = {
  ruleId: string
  severity: Severity
  /** Absolute path of the entry at fault. */
  path: string
  /**
   * The scope's label, not the scope itself: a finding outlives the scope that
   * raised it, and holding the scope would keep its whole file list alive.
   */
  scope: string
  detail?: string
}

/** Runs one rule over one scope and labels what it returns. */
export function runRule(
  rule: Rule,
  scope: Scope,
  context: RuleContext
): Finding[] {
  return rule.check(scope, context).map((report) => ({
    ruleId: rule.id,
    severity: rule.severity,
    path: report.path,
    scope: scopeLabel(scope),
    ...(report.detail === undefined ? {} : {detail: report.detail}),
  }))
}
