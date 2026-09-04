import {describe, expect, test} from 'vitest'
import {
  exitCode,
  formatDuration,
  formatLintReport,
  SAMPLE_CAP,
  type LintReport,
} from '../src/lib/lintReport.ts'
import type {Finding, Severity} from '../src/lib/rules/index.ts'

const finding = (
  ruleId: string,
  severity: Severity,
  path: string,
  detail?: string
): Finding => ({
  ruleId,
  severity,
  path,
  scope: 'archive root',
  ...(detail === undefined ? {} : {detail}),
})

const report = (
  findings: Finding[],
  extras: Partial<LintReport> = {}
): LintReport => ({
  archiveRoot: '/archive',
  findings,
  scopes: 341,
  files: 180_142,
  durationMs: 490_000,
  strict: false,
  verbose: false,
  ...extras,
})

describe('formatDuration', () => {
  test('minutes and seconds, or seconds alone', () => {
    expect(formatDuration(490_000)).toBe('8m 10s')
    expect(formatDuration(47_000)).toBe('47s')
    expect(formatDuration(60_000)).toBe('1m 0s')
    // Minutes keep counting past an hour rather than rolling over.
    expect(formatDuration(5_400_000)).toBe('90m 0s')
    expect(formatDuration(3_661_000)).toBe('61m 1s')
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(499)).toBe('0s')
    expect(formatDuration(500)).toBe('1s')
  })
})

describe('formatLintReport', () => {
  test('says what it walked, and that it found nothing', () => {
    expect(formatLintReport(report([]))).toStrictEqual([
      '180142 file(s) in 341 scope(s), 8m 10s',
      '',
      'Clean — nothing to report.',
    ])
  })

  test('groups by severity, then by rule, with counts and details', () => {
    const lines = formatLintReport(
      report([
        finding(
          'event-name-case',
          'warning',
          '/archive/events/2019-08-11-my-trip',
          'my-trip'
        ),
        finding('root-file', 'error', '/archive/notes.txt'),
        finding('root-unknown-folder', 'info', '/archive/ai', 'not linted'),
      ])
    )

    expect(lines).toStrictEqual([
      '180142 file(s) in 341 scope(s), 8m 10s',
      '',
      '1 error(s):',
      '  root-file — Visible file at the archive root (1)',
      '    /archive/notes.txt',
      '',
      '1 warning(s):',
      '  event-name-case — Event name is not PascalCase (1)',
      '    /archive/events/2019-08-11-my-trip — my-trip',
      '',
      '1 info:',
      '  root-unknown-folder — Top-level folder that is not events/, sorted/ or relations/ (1)',
      '    /archive/ai — not linted',
      '',
      'Warnings do not fail the run. Pass --strict to make them.',
    ])
  })

  test('orders the rules as the registry does, not as the findings arrived', () => {
    const lines = formatLintReport(
      report([
        finding('raw-orphan', 'error', '/archive/a.DNG'),
        finding('root-file', 'error', '/archive/notes.txt'),
      ])
    )

    expect(lines.filter((line) => line.startsWith('  '))).toStrictEqual([
      '  root-file — Visible file at the archive root (1)',
      '    /archive/notes.txt',
      '  raw-orphan — RAW in raw_versions/ with no viewable twin (1)',
      '    /archive/a.DNG',
    ])
  })

  test('caps a backlog and counts the rest', () => {
    const hits = Array.from({length: 25}, (_, index) =>
      finding('sidecar-file', 'warning', `/archive/f${index}.thm`)
    )
    const lines = formatLintReport(report(hits))

    expect(lines).toContain(
      '  sidecar-file — Sidecar clutter (.thm / .xmp / .aae) in footage/ (25)'
    )
    expect(lines).toContain(`    /archive/f${SAMPLE_CAP - 1}.thm`)
    expect(lines).not.toContain(`    /archive/f${SAMPLE_CAP}.thm`)
    expect(lines).toContain(`    … and ${25 - SAMPLE_CAP} more`)
  })

  test('--verbose lists every finding and drops the "more" line', () => {
    const hits = Array.from({length: 25}, (_, index) =>
      finding('sidecar-file', 'warning', `/archive/f${index}.thm`)
    )
    const lines = formatLintReport(report(hits, {verbose: true}))

    expect(lines).toContain('    /archive/f24.thm')
    expect(lines.some((line) => line.includes('more'))).toBe(false)
  })

  test('drops the warnings hint under --strict', () => {
    const lines = formatLintReport(
      report([finding('sidecar-file', 'warning', '/archive/a.thm')], {
        strict: true,
      })
    )
    expect(lines.some((line) => line.includes('--strict'))).toBe(false)
  })
})

describe('exitCode', () => {
  const error = finding('root-file', 'error', '/archive/notes.txt')
  const warning = finding('sidecar-file', 'warning', '/archive/a.thm')
  const info = finding('root-unknown-folder', 'info', '/archive/ai')

  test('0 when nothing failed', () => {
    expect(exitCode(report([]))).toBe(0)
    expect(exitCode(report([warning, info]))).toBe(0)
  })

  test('1 on any error', () => {
    expect(exitCode(report([error]))).toBe(1)
  })

  test('--strict makes warnings fail, but never info', () => {
    expect(exitCode(report([warning], {strict: true}))).toBe(1)
    expect(exitCode(report([info], {strict: true}))).toBe(0)
  })
})
