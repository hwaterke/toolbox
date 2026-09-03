import {promises as fs} from 'node:fs'
import nodePath from 'node:path'
import {findPair, type PairCandidate} from './findPair.ts'
import {resolveDestination} from './layout.ts'
import type {ScannedFile} from './scan.ts'

export type PairOutcome =
  | {kind: 'not_raw'}
  | {kind: 'paired'; method: 'exact' | 'pass2'; photo: string}
  | {kind: 'unpaired'}
  | {kind: 'ambiguous'; candidates: string[]}

export type DirectoryLister = (directory: string) => Promise<string[]>

/**
 * Reads each destination directory at most once per run. A month folder holds
 * thousands of files and every RAW would otherwise re-list it (T6).
 */
export class DirectoryCache {
  private readonly entries = new Map<string, Promise<string[]>>()

  private readonly lister: DirectoryLister

  constructor(lister: DirectoryLister = listDirectory) {
    this.lister = lister
  }

  list(directory: string): Promise<string[]> {
    const cached = this.entries.get(directory)
    if (cached !== undefined) {
      return cached
    }
    const pending = this.lister(directory)
    this.entries.set(directory, pending)
    return pending
  }

  get size(): number {
    return this.entries.size
  }
}

/** Filenames in a directory; an absent directory lists as empty. */
export async function listDirectory(directory: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, {withFileTypes: true})
    return entries.filter((entry) => !entry.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
}

export type PairingInput = {
  files: readonly ScannedFile[]
  archiveRoot: string
  event?: string | undefined
  source?: string | undefined
  cache?: DirectoryCache
}

/**
 * Decide, for every RAW in the batch, whether it has a viewable twin — in the
 * batch itself or already filed at the destination (decision 5).
 *
 * The twin is always a photo, so it lives in the *normal* destination folder,
 * never in the bucket. Ambiguous matches are reported and the RAW is treated as
 * unpaired, so it lands beside its siblings rather than being guessed into the
 * bucket (decision 6).
 */
export async function resolvePairs(
  input: PairingInput
): Promise<Map<string, PairOutcome>> {
  const {files, archiveRoot, event, source} = input
  const cache = input.cache ?? new DirectoryCache()
  const outcomes = new Map<string, PairOutcome>()

  const batch: PairCandidate[] = files.map((file) => ({
    name: file.name,
    path: file.path,
  }))

  for (const file of files) {
    if (!file.isRaw) {
      outcomes.set(file.path, {kind: 'not_raw'})
      continue
    }

    // Where a viewable twin would live: the normal folder, never the bucket.
    const photoFolder = resolveDestination({
      year: file.parsed.year,
      month: file.parsed.month,
      isRaw: false,
      hasPair: false,
      event,
      source,
    })
    const photoDirectory = nodePath.join(archiveRoot, photoFolder)
    const existing: PairCandidate[] = (await cache.list(photoDirectory)).map(
      (name) => ({name, path: nodePath.join(photoDirectory, name)})
    )

    const result = findPair(file.name, [...batch, ...existing])

    if (result === null) {
      outcomes.set(file.path, {kind: 'unpaired'})
    } else if (result.method === 'ambiguous') {
      outcomes.set(file.path, {
        kind: 'ambiguous',
        candidates: result.candidates.map((candidate) => candidate.name),
      })
    } else {
      outcomes.set(file.path, {
        kind: 'paired',
        method: result.method,
        photo: result.photo.name,
      })
    }
  }

  return outcomes
}

/** Only a confidently paired RAW goes to the bucket (decisions 4 and 6). */
export function goesToBucket(outcome: PairOutcome): boolean {
  return outcome.kind === 'paired'
}
