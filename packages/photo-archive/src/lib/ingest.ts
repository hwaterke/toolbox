import {moveFileIntoFolder} from '@hwaterke/file-utils'
import {promises as fs} from 'node:fs'
import nodePath from 'node:path'
import {resolveDestination} from './layout.ts'
import {Manifest} from './manifest.ts'
import {goesToBucket, resolvePairs, type PairOutcome} from './pairing.ts'
import {preflight, type PreflightFailure} from './preflight.ts'
import {scanSource, type RejectReason} from './scan.ts'

export type LeftBehindReason =
  RejectReason | 'destination_exists' | 'ambiguous_pair' | 'error'

export type MovedFile = {
  from: string
  to: string
  bucketed: boolean
}

export type LeftBehind = {
  path: string
  name: string
  reason: LeftBehindReason
  detail?: string | undefined
}

export type IngestReport = {
  moved: MovedFile[]
  leftBehind: LeftBehind[]
  /** Scanned media files that carried a usable date prefix. */
  planned: number
  dryRun: boolean
  manifestPath: string | null
}

export type IngestOptions = {
  source: string
  archiveRoot: string
  event?: string | undefined
  sourceName?: string | undefined
  createEvent: boolean
  execute: boolean
  manifest?: Manifest | undefined
  onProgress?: ((message: string) => void) | undefined
  now?: (() => Date) | undefined
}

export class PreflightError extends Error {}

/**
 * Move a batch of already-renamed media into the archive.
 *
 * Dry run is the default (decision 11): with `execute: false` every check still
 * runs and the same report comes back, but `moveFileIntoFolder` skips mkdir,
 * rename, copy and unlink (decision 24), so the reported plan cannot drift from
 * what a real run would do.
 */
export async function ingest(options: IngestOptions): Promise<IngestReport> {
  const checked = await preflight({
    source: options.source,
    archiveRoot: options.archiveRoot,
    event: options.event,
    sourceName: options.sourceName,
    createEvent: options.createEvent,
  })

  if (!checked.ok) {
    throw new PreflightError((checked as PreflightFailure).error)
  }

  const dryRun = !options.execute
  const {archiveRoot, event, sourceName} = checked
  const now = options.now ?? (() => new Date())

  const {files, rejected} = await scanSource(checked.source)

  const leftBehind: LeftBehind[] = rejected.map((file) => ({
    path: file.path,
    name: file.name,
    reason: file.reason,
  }))

  const pairs = await resolvePairs({
    files,
    archiveRoot,
    event,
    source: sourceName,
  })

  if (checked.eventToCreate !== undefined && !dryRun) {
    await fs.mkdir(
      nodePath.join(archiveRoot, 'events', checked.eventToCreate, 'footage'),
      {recursive: true}
    )
  }

  const moved: MovedFile[] = []

  for (const file of files) {
    const outcome: PairOutcome = pairs.get(file.path) ?? {kind: 'not_raw'}

    if (outcome.kind === 'ambiguous') {
      leftBehind.push({
        path: file.path,
        name: file.name,
        reason: 'ambiguous_pair',
        detail: outcome.candidates.join(', '),
      })
      continue
    }

    const bucketed = goesToBucket(outcome)
    const folder = nodePath.join(
      archiveRoot,
      resolveDestination({
        year: file.parsed.year,
        month: file.parsed.month,
        isRaw: file.isRaw,
        hasPair: bucketed,
        event,
        source: sourceName,
      })
    )

    try {
      const result = await moveFileIntoFolder(file.path, folder, {
        ifExists: 'skip',
        dryRun,
      })

      if (result.skipped) {
        leftBehind.push({
          path: file.path,
          name: file.name,
          reason: 'destination_exists',
          detail: result.destinationPath,
        })
        continue
      }

      moved.push({
        from: file.path,
        to: result.destinationPath,
        bucketed,
      })
      options.onProgress?.(`${file.name} -> ${result.destinationPath}`)

      if (!dryRun) {
        await options.manifest?.append({
          at: now().toISOString(),
          from: file.path,
          to: result.destinationPath,
        })
      }
    } catch (error) {
      leftBehind.push({
        path: file.path,
        name: file.name,
        reason: 'error',
        detail: String(error),
      })
    }
  }

  return {
    moved,
    leftBehind,
    planned: files.length,
    dryRun,
    manifestPath:
      options.manifest !== undefined && !options.manifest.isEmpty
        ? options.manifest.path
        : null,
  }
}
