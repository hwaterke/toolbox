import {isDirectory} from '@hwaterke/file-utils'
import nodePath from 'node:path'
import type {LintReport} from './lintReport.ts'
import {scopeLabel} from './model.ts'
import {PreflightError} from './preflight.ts'
import {RULES, runRule, ruleById, type Finding} from './rules/index.ts'
import {walkArchive} from './walk.ts'

export type LintOptions = {
  archiveRoot: string
  /** Absolute paths to judge; empty walks the whole archive. */
  only?: readonly string[] | undefined
  /** Rule ids to run; empty runs them all. */
  rules?: readonly string[] | undefined
  strict: boolean
  verbose: boolean
  maxDaysEarly: number
  onProgress?: ((message: string) => void) | undefined
  /** Injectable clock, so the report's duration is testable. */
  now?: (() => number) | undefined
}

/**
 * Walk the archive one scope at a time and judge each against the rules. The
 * scope is dropped before the next is read, so peak memory is the largest
 * single event, not the archive; only the findings are kept.
 *
 * Reads only. There is no `--fix` and there never will be: moving files is
 * `ingest`'s job, and it writes a manifest so `undo` can put them back.
 */
export async function lintArchive(options: LintOptions): Promise<LintReport> {
  const archiveRoot = nodePath.resolve(options.archiveRoot)
  const now = options.now ?? (() => Date.now())

  if (!(await isDirectory(archiveRoot))) {
    throw new PreflightError(`Archive root is not a directory: ${archiveRoot}`)
  }

  // The same refusal as `ingest`: the root must already look like an archive.
  const hasEvents = await isDirectory(nodePath.join(archiveRoot, 'events'))
  const hasSorted = await isDirectory(nodePath.join(archiveRoot, 'sorted'))
  if (!hasEvents && !hasSorted) {
    throw new PreflightError(
      `Archive root holds neither events/ nor sorted/: ${archiveRoot}\n` +
        'Refusing to treat it as an archive.'
    )
  }

  const only = (options.only ?? []).map((path) => nodePath.resolve(path))
  for (const path of only) {
    if (
      path !== archiveRoot &&
      !path.startsWith(`${archiveRoot}${nodePath.sep}`)
    ) {
      throw new PreflightError(`--only is outside the archive: ${path}`)
    }
  }

  const wanted = options.rules ?? []
  for (const id of wanted) {
    if (ruleById(id) === undefined) {
      throw new PreflightError(`Unknown rule: ${id}`)
    }
  }
  const rules =
    wanted.length === 0
      ? RULES
      : RULES.filter((rule) => wanted.includes(rule.id))

  const context = {maxDaysEarly: options.maxDaysEarly}
  const findings: Finding[] = []
  let scopes = 0
  let files = 0
  const started = now()

  for await (const scope of walkArchive({
    archiveRoot,
    only,
    onProgress: (progress) => {
      scopes = progress.scopeIndex
      files += progress.files
      options.onProgress?.(
        `${scopeLabel(progress.scope)} — ${progress.files} file(s)`
      )
    },
  })) {
    for (const rule of rules) {
      findings.push(...runRule(rule, scope, context))
    }
  }

  return {
    archiveRoot,
    findings,
    scopes,
    files,
    durationMs: now() - started,
    strict: options.strict,
    verbose: options.verbose,
  }
}
