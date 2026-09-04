import {describe, expect, test} from 'vitest'
import {PlanSummary} from '../src/lib/PlanSummary.ts'
import type {Plan, PlanVerdict} from '../src/lib/plan.ts'

const plan = (verdict: PlanVerdict, reason = 'because'): Plan => ({
  verdict,
  reason,
  writes: [],
})

const capture = (summary: PlanSummary): string[] => {
  const lines: string[] = []
  const collect = (message: string) => lines.push(message)
  summary.print({
    debug: collect,
    info: collect,
    warn: collect,
    error: collect,
    command: collect,
  })
  return lines
}

describe('PlanSummary', () => {
  test('counts each verdict', () => {
    const summary = new PlanSummary()
    summary.record('a.JPG', plan('ok'))
    summary.record('b.JPG', plan('ok'))
    summary.record('c.JPG', plan('written'))

    expect(capture(summary)).toContain('  ok        2')
    expect(capture(summary)).toContain('  written   1')
  })

  test('leaves out verdicts that never happened', () => {
    const summary = new PlanSummary()
    summary.record('a.JPG', plan('ok'))

    expect(capture(summary).join('\n')).not.toContain('failed')
  })

  test('prints the full path of every skipped and failed file', () => {
    const summary = new PlanSummary()
    summary.record('/photos/a.JPG', plan('skipped', 'zones disagree'))
    summary.record('/photos/b.JPG', plan('failed', 'no DateTimeOriginal'))

    const printed = capture(summary).join('\n')
    expect(printed).toContain('/photos/a.JPG - zones disagree')
    expect(printed).toContain('/photos/b.JPG - no DateTimeOriginal')
  })

  test('counts ignored files without listing them', () => {
    const summary = new PlanSummary()
    summary.record('/photos/canon.JPG', plan('ignored', 'not a Nikon file'))

    const printed = capture(summary).join('\n')
    expect(printed).toContain('  ignored   1')
    expect(printed).not.toContain('/photos/canon.JPG')
  })

  test('records a thrown error as a failure of that file', () => {
    const summary = new PlanSummary()
    summary.recordError('/photos/a.JPG', new Error('exiftool exploded'))

    expect(summary.failureCount).toBe(1)
    expect(capture(summary).join('\n')).toContain(
      '/photos/a.JPG - exiftool exploded'
    )
  })

  test('reports no failures when nothing failed', () => {
    const summary = new PlanSummary()
    summary.record('a.JPG', plan('skipped'))

    expect(summary.failureCount).toBe(0)
  })
})
