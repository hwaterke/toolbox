/**
 * A plan is the decision half of a command: what a file should end up looking
 * like, and which exiftool arguments get it there. Nothing here touches disk,
 * so `--dryRun` is exact by construction: it runs the same plan and stops
 * before the executor.
 */
export type PlanVerdict =
  /** The file already matches the target state. Nothing to write. */
  | 'ok'
  /**
   * Not a file this command owns - wrong extension, wrong camera. Counted, so
   * nothing is dropped silently, but never listed: a mixed folder would drown
   * the real findings.
   */
  | 'ignored'
  /** Tags are missing or wrong and can be written. */
  | 'written'
  /** Same as `written`, plus it undoes damage left by an older version. */
  | 'repaired'
  /** We cannot prove the target state, so we write nothing. */
  | 'skipped'
  /** The file is malformed in a way we refuse to guess around. */
  | 'failed'

export type Plan = {
  verdict: PlanVerdict
  /** One short sentence, printed next to the file path. */
  reason: string
  /** exiftool arguments, e.g. `-OffsetTime=+02:00`. Empty unless writing. */
  writes: string[]
}
