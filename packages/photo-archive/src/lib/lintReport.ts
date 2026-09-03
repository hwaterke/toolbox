import chalk from 'chalk'
import {RULES, type Finding, type Severity} from './rules/index.ts'

/** How many findings of one rule are listed before the rest are counted. */
export const SAMPLE_CAP = 10

const SEVERITY_ORDER: Severity[] = ['error', 'warning', 'info']

const SEVERITY_LABELS: Record<Severity, string> = {
  error: 'error(s)',
  warning: 'warning(s)',
  info: 'info',
}

export type LintReport = {
  /** Absolute archive root that was linted. */
  archiveRoot: string
  findings: readonly Finding[]
  /** Scopes judged. */
  scopes: number
  /** Files materialised across every scope. */
  files: number
  /** Wall time of the walk, in milliseconds. */
  durationMs: number
  /** Warnings fail the run too. */
  strict: boolean
  /** List every finding instead of a capped sample per rule. */
  verbose: boolean
}

/** `8m 10s`, or `47s` under a minute. A full run takes about eight minutes. */
export function formatDuration(durationMs: number): string {
  const seconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(seconds / 60)
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds % 60}s`
}

/** The rule ids that actually fired, in registry order. */
function firedRules(
  findings: readonly Finding[],
  severity: Severity
): string[] {
  const fired = new Set(
    findings
      .filter((finding) => finding.severity === severity)
      .map((finding) => finding.ruleId)
  )
  return RULES.filter((rule) => fired.has(rule.id)).map((rule) => rule.id)
}

/**
 * The end-of-run summary: findings grouped by severity, then by rule, each with
 * its own count and a capped sample. A backlog rule fires thousands of times —
 * the count is the useful part, the sample is there to start from. Returns
 * plain lines so the command can print them and the tests can assert on them.
 */
export function formatLintReport(report: LintReport): string[] {
  const lines: string[] = []

  lines.push(
    `${report.files} file(s) in ${report.scopes} scope(s), ${formatDuration(report.durationMs)}`
  )

  if (report.findings.length === 0) {
    lines.push('')
    lines.push('Clean — nothing to report.')
    return lines
  }

  for (const severity of SEVERITY_ORDER) {
    const ofSeverity = report.findings.filter(
      (finding) => finding.severity === severity
    )
    if (ofSeverity.length === 0) {
      continue
    }

    lines.push('')
    lines.push(`${ofSeverity.length} ${SEVERITY_LABELS[severity]}:`)

    for (const ruleId of firedRules(report.findings, severity)) {
      const rule = RULES.find((candidate) => candidate.id === ruleId)!
      const hits = ofSeverity.filter((finding) => finding.ruleId === ruleId)
      lines.push(`  ${ruleId} — ${rule.title} (${hits.length})`)

      const shown = report.verbose ? hits : hits.slice(0, SAMPLE_CAP)
      for (const finding of shown) {
        lines.push(
          `    ${finding.path}` +
            (finding.detail === undefined ? '' : ` — ${finding.detail}`)
        )
      }
      if (hits.length > shown.length) {
        lines.push(`    … and ${hits.length - shown.length} more`)
      }
    }
  }

  if (!report.strict && report.findings.some((f) => f.severity === 'warning')) {
    lines.push('')
    lines.push('Warnings do not fail the run. Pass --strict to make them.')
  }

  return lines
}

/**
 * 0 clean, 1 anything that fails. Exit 2 is the pre-flight refusal, raised by
 * the command before a report exists. Info never fails a run: an unlinted
 * top-level folder is a fact, not a fault.
 */
export function exitCode(report: LintReport): number {
  const fails: Severity[] = report.strict ? ['error', 'warning'] : ['error']
  return report.findings.some((finding) => fails.includes(finding.severity))
    ? 1
    : 0
}

export type LintJson = {
  archiveRoot: string
  files: number
  scopes: number
  durationMs: number
  strict: boolean
  exitCode: number
  findings: readonly Finding[]
}

/**
 * The whole run as one object, for a script to act on. Every finding is
 * included: the sample cap is a courtesy to a human reader, not a filter.
 */
export function toJson(report: LintReport): LintJson {
  return {
    archiveRoot: report.archiveRoot,
    files: report.files,
    scopes: report.scopes,
    durationMs: report.durationMs,
    strict: report.strict,
    exitCode: exitCode(report),
    findings: report.findings,
  }
}

export function colorize(line: string): string {
  if (/^\d+ error\(s\):$/.test(line)) {
    return chalk.red(line)
  }
  if (/^\d+ warning\(s\):$/.test(line)) {
    return chalk.yellow(line)
  }
  if (line.startsWith('Clean —')) {
    return chalk.green(line)
  }
  return line
}
