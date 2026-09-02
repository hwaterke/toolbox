import chalk from 'chalk'
import type {IngestReport, LeftBehindReason} from './ingest.ts'

const REASON_LABELS: Record<LeftBehindReason, string> = {
  unknown_type: 'not a known media type',
  no_date_prefix: 'no YYYY-MM-DD_HH-mm-ss_ prefix',
  destination_exists: 'already at destination',
  ambiguous_pair: 'ambiguous RAW pairing',
  error: 'failed to move',
}

/**
 * The end-of-run summary: what moved, then everything left behind grouped by
 * reason (decision 18). Returns plain lines so the command can print them and
 * the tests can assert on them.
 */
export function formatReport(report: IngestReport): string[] {
  const lines: string[] = []
  const verb = report.dryRun ? 'would move' : 'moved'

  const bucketed = report.moved.filter((file) => file.bucketed).length
  lines.push(
    `${report.moved.length} file(s) ${verb}` +
      (bucketed > 0 ? ` (${bucketed} paired RAW to raw_versions)` : '')
  )

  if (report.leftBehind.length > 0) {
    const groups = new Map<LeftBehindReason, string[]>()
    for (const file of report.leftBehind) {
      const list = groups.get(file.reason) ?? []
      list.push(
        file.detail === undefined ? file.name : `${file.name} — ${file.detail}`
      )
      groups.set(file.reason, list)
    }

    lines.push('')
    lines.push(`${report.leftBehind.length} file(s) left in place:`)
    for (const [reason, entries] of groups) {
      lines.push(`  ${REASON_LABELS[reason]} (${entries.length})`)
      for (const entry of entries) {
        lines.push(`    ${entry}`)
      }
    }
  }

  if (report.manifestPath !== null) {
    lines.push('')
    lines.push(`Manifest: ${report.manifestPath}`)
    lines.push('Undo with: photo-archive undo <manifest> --execute')
  }

  if (report.dryRun) {
    lines.push('')
    lines.push('Dry run — nothing was moved. Pass --execute to act.')
  }

  return lines
}

/** Exit 1 when anything was left behind, 0 when the source was drained (18). */
export function exitCode(report: IngestReport): number {
  return report.leftBehind.length > 0 ? 1 : 0
}

export function colorize(line: string): string {
  if (line.startsWith('Dry run')) {
    return chalk.yellow(line)
  }
  if (line.endsWith('left in place:')) {
    return chalk.red(line)
  }
  return line
}
