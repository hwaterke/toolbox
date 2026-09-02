import {moveFileIntoFolder} from '@hwaterke/file-utils'
import {promises as fs} from 'node:fs'
import nodePath from 'node:path'
import {readManifest, type ManifestEntry} from './manifest.ts'

export type UndoSkipReason =
  'archived_file_missing' | 'original_path_taken' | 'error'

export type RestoredFile = {
  from: string
  to: string
}

export type UndoSkip = {
  entry: ManifestEntry
  reason: UndoSkipReason
  detail?: string | undefined
}

export type UndoReport = {
  restored: RestoredFile[]
  skipped: UndoSkip[]
  /** Entries read from the manifest. */
  total: number
  dryRun: boolean
}

export type UndoOptions = {
  manifestPath: string
  execute: boolean
  onProgress?: ((message: string) => void) | undefined
}

/**
 * Reverse an ingest run: walk its manifest backwards and move every file back
 * to the folder it came from, using the same verified mover.
 *
 * Dry run is the default, exactly as `ingest` (decision 11). A file that is no
 * longer where the manifest says, or whose original path is occupied again, is
 * reported and left alone — undo never overwrites.
 *
 * Folders the ingest created are left in place, even when they end up empty:
 * removing directories is not something this command guesses at.
 */
export async function undo(options: UndoOptions): Promise<UndoReport> {
  const entries = await readManifest(options.manifestPath)
  const dryRun = !options.execute

  const restored: RestoredFile[] = []
  const skipped: UndoSkip[] = []

  for (const entry of [...entries].reverse()) {
    let archivedIsFile = false
    try {
      archivedIsFile = (await fs.lstat(entry.to)).isFile()
    } catch {
      archivedIsFile = false
    }

    if (!archivedIsFile) {
      skipped.push({entry, reason: 'archived_file_missing', detail: entry.to})
      continue
    }

    try {
      const result = await moveFileIntoFolder(
        entry.to,
        nodePath.dirname(entry.from),
        {ifExists: 'skip', dryRun}
      )

      if (result.skipped) {
        skipped.push({
          entry,
          reason: 'original_path_taken',
          detail: result.destinationPath,
        })
        continue
      }

      restored.push({from: entry.to, to: result.destinationPath})
      options.onProgress?.(`${entry.to} -> ${result.destinationPath}`)
    } catch (error) {
      skipped.push({entry, reason: 'error', detail: String(error)})
    }
  }

  return {restored, skipped, total: entries.length, dryRun}
}

const UNDO_REASON_LABELS: Record<UndoSkipReason, string> = {
  archived_file_missing: 'not where the manifest says',
  original_path_taken: 'original path is occupied',
  error: 'failed to move back',
}

export function formatUndoReport(report: UndoReport): string[] {
  const lines: string[] = []
  const verb = report.dryRun ? 'would move back' : 'moved back'
  lines.push(`${report.restored.length} of ${report.total} file(s) ${verb}`)

  if (report.skipped.length > 0) {
    const groups = new Map<UndoSkipReason, string[]>()
    for (const skip of report.skipped) {
      const list = groups.get(skip.reason) ?? []
      list.push(skip.detail ?? skip.entry.to)
      groups.set(skip.reason, list)
    }
    lines.push('')
    lines.push(`${report.skipped.length} file(s) not restored:`)
    for (const [reason, items] of groups) {
      lines.push(`  ${UNDO_REASON_LABELS[reason]} (${items.length})`)
      for (const item of items) {
        lines.push(`    ${item}`)
      }
    }
  }

  if (report.dryRun) {
    lines.push('')
    lines.push('Dry run — nothing was moved. Pass --execute to act.')
  }

  return lines
}

/** Exit 1 when anything could not be put back. */
export function undoExitCode(report: UndoReport): number {
  return report.skipped.length > 0 ? 1 : 0
}
