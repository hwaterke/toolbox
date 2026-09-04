import type {Logger} from './Logger.ts'
import type {Plan, PlanVerdict} from './plan.ts'

/** Printed in this order, so the interesting verdicts come last. */
const VERDICT_ORDER: PlanVerdict[] = [
  'ok',
  'written',
  'repaired',
  'ignored',
  'skipped',
  'failed',
]

/** Verdicts worth a full path. The rest are counted and left at that. */
const LISTED_VERDICTS: PlanVerdict[] = ['skipped', 'failed']

/**
 * Collects one verdict per file and prints the end-of-run report.
 *
 * Full paths for everything skipped or failed, because those are the files the
 * user has to go and look at. Counts for the rest.
 */
export class PlanSummary {
  private readonly counts = new Map<PlanVerdict, number>()
  private readonly listed = new Map<
    PlanVerdict,
    {path: string; reason: string}[]
  >()

  record(path: string, plan: Plan): void {
    this.counts.set(plan.verdict, (this.counts.get(plan.verdict) ?? 0) + 1)

    if (LISTED_VERDICTS.includes(plan.verdict)) {
      const entries = this.listed.get(plan.verdict) ?? []
      entries.push({path, reason: plan.reason})
      this.listed.set(plan.verdict, entries)
    }
  }

  /** An error thrown while reading the file counts as a failure of that file. */
  recordError(path: string, error: unknown): void {
    this.record(path, {
      verdict: 'failed',
      reason: error instanceof Error ? error.message : String(error),
      writes: [],
    })
  }

  get failureCount(): number {
    return this.counts.get('failed') ?? 0
  }

  print(logger: typeof Logger): void {
    logger.info('')
    logger.info('Summary')
    for (const verdict of VERDICT_ORDER) {
      const count = this.counts.get(verdict)
      if (count !== undefined) {
        logger.info(`  ${verdict.padEnd(9)} ${count}`)
      }
    }

    for (const verdict of LISTED_VERDICTS) {
      const entries = this.listed.get(verdict)
      if (entries === undefined) {
        continue
      }
      const log = (message: string) => {
        if (verdict === 'failed') {
          logger.error(message)
        } else {
          logger.warn(message)
        }
      }
      logger.info('')
      log(`${verdict} (${entries.length}):`)
      for (const {path, reason} of entries) {
        log(`  ${path} - ${reason}`)
      }
    }
  }
}
