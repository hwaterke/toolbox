import {IgnoreManager} from '@hwaterke/file-utils'
import {promises as fs} from 'node:fs'
import nodePath from 'node:path'
import {LINTED_ROOTS, PANORAMA} from './constants.ts'
import type {
  MediaTree,
  Scope,
  ScopeEntry,
  ScopeFile,
  ScopeFolder,
} from './model.ts'

/** The archive's own ignore file, holding `.DS_Store` and `@eaDir/` (T7). */
export const IGNORE_FILE = 'fs-ignore'

export type WalkProgress = {
  /** The scope just finished. */
  scope: Scope
  /** Scopes yielded so far, this one included. */
  scopeIndex: number
  /** Files materialised for this scope. */
  files: number
}

export type WalkOptions = {
  /** Absolute path of the archive root. */
  archiveRoot: string
  /**
   * Only walk scopes whose path starts with one of these absolute paths. An
   * empty or absent list walks everything.
   */
  only?: readonly string[]
  onProgress?: (progress: WalkProgress) => void
}

const toPosix = (p: string): string => p.split(nodePath.sep).join('/')

/**
 * Yields the archive one scope at a time, deepest content last, so a caller can
 * judge a scope and drop it before the next is read. Nothing is buffered across
 * scopes.
 *
 * Ignoring comes from the archive's own `fs-ignore` file, read once at the root
 * and applied to every path below it (T7) — `.DS_Store` and `@eaDir` are never
 * named here. Dotfiles are skipped everywhere, and `fs-ignore` itself is
 * reserved rather than reported.
 *
 * A `panorama` folder is listed but never descended into: its sets nest one
 * level deeper than anything else and carry no date prefix (T3).
 */
export async function* walkArchive(
  options: WalkOptions
): AsyncGenerator<Scope> {
  const archiveRoot = nodePath.resolve(options.archiveRoot)
  const only = options.only?.map((p) => nodePath.resolve(p)) ?? []

  const ignoreManager = new IgnoreManager(IGNORE_FILE)
  await ignoreManager.addIgnoreFile(archiveRoot)

  let scopeIndex = 0

  /** True when the scope at `path` should be judged. */
  const wanted = (path: string): boolean =>
    only.length === 0 ||
    only.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))

  /**
   * True when the walk must still go through `path` to reach something wanted.
   * A `--only` naming one month has to be read through `sorted/` and its year
   * folder, neither of which is itself judged.
   */
  const onWay = (path: string): boolean =>
    wanted(path) || only.some((prefix) => prefix.startsWith(`${path}/`))

  const report = (scope: Scope, files: number): Scope => {
    scopeIndex++
    options.onProgress?.({scope, scopeIndex, files})
    return scope
  }

  /** Direct children, minus dotfiles, ignored paths and the ignore file. */
  const listEntries = async (directory: string): Promise<ScopeEntry[]> => {
    let dirents
    try {
      dirents = await fs.readdir(directory, {withFileTypes: true})
    } catch {
      return []
    }
    const entries: ScopeEntry[] = []
    for (const dirent of dirents) {
      if (dirent.name.startsWith('.') || dirent.name === IGNORE_FILE) {
        continue
      }
      const path = nodePath.join(directory, dirent.name)
      const isDirectory = dirent.isDirectory()
      if (ignoreManager.shouldIgnore(path, isDirectory)) {
        continue
      }
      entries.push({name: dirent.name, path, isDirectory})
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    return entries
  }

  /** One media tree, read in full. `panorama` is listed but not descended. */
  const readTree = async (treeRoot: string): Promise<MediaTree> => {
    const entries = await listEntries(treeRoot)
    const folders: ScopeFolder[] = []
    const files: ScopeFile[] = []

    const descend = async (
      directory: string,
      directoryEntries: ScopeEntry[]
    ): Promise<void> => {
      for (const entry of directoryEntries) {
        const relativePath = toPosix(nodePath.relative(treeRoot, entry.path))
        if (entry.isDirectory) {
          const isPanorama = entry.name === PANORAMA
          folders.push({
            name: entry.name,
            path: entry.path,
            relativePath,
            isPanorama,
          })
          if (isPanorama) {
            continue
          }
          await descend(entry.path, await listEntries(entry.path))
          continue
        }
        files.push({
          name: entry.name,
          path: entry.path,
          relativePath,
          folder: toPosix(nodePath.relative(treeRoot, directory)),
        })
      }
    }

    await descend(treeRoot, entries)
    return {path: treeRoot, entries, folders, files}
  }

  const eventScope = async (
    entry: ScopeEntry,
    person: string | null
  ): Promise<Scope> => {
    const entries = await listEntries(entry.path)
    const hasFootage = entries.some(
      (e) => e.name === 'footage' && e.isDirectory
    )
    const footage = hasFootage
      ? await readTree(nodePath.join(entry.path, 'footage'))
      : null
    return report(
      {
        kind: 'event',
        name: entry.name,
        path: entry.path,
        entries,
        footage,
        person,
      },
      footage?.files.length ?? 0
    )
  }

  /** `events/` holds event folders and nothing else worth a scope of its own. */
  async function* walkEvents(
    eventsRoot: string,
    person: string | null
  ): AsyncGenerator<Scope> {
    for (const entry of await listEntries(eventsRoot)) {
      if (!entry.isDirectory || !wanted(entry.path)) {
        continue
      }
      yield await eventScope(entry, person)
    }
  }

  /** `sorted/` — its own listing, each year's listing, then each month. */
  async function* walkSorted(
    sortedRoot: string,
    person: string | null
  ): AsyncGenerator<Scope> {
    const years = await listEntries(sortedRoot)
    if (wanted(sortedRoot)) {
      yield report(
        {kind: 'sorted', year: null, path: sortedRoot, entries: years, person},
        0
      )
    }

    for (const yearEntry of years) {
      if (!yearEntry.isDirectory || !onWay(yearEntry.path)) {
        continue
      }
      const months = await listEntries(yearEntry.path)
      if (wanted(yearEntry.path)) {
        yield report(
          {
            kind: 'sorted',
            year: yearEntry.name,
            path: yearEntry.path,
            entries: months,
            person,
          },
          0
        )
      }

      for (const monthEntry of months) {
        if (!monthEntry.isDirectory || !wanted(monthEntry.path)) {
          continue
        }
        const tree = await readTree(monthEntry.path)
        yield report(
          {
            kind: 'month',
            year: yearEntry.name,
            month: monthEntry.name,
            path: monthEntry.path,
            tree,
            person,
          },
          tree.files.length
        )
      }
    }
  }

  const rootEntries = await listEntries(archiveRoot)
  if (wanted(archiveRoot)) {
    yield report({kind: 'root', path: archiveRoot, entries: rootEntries}, 0)
  }

  for (const entry of rootEntries) {
    if (!entry.isDirectory) {
      continue
    }
    if (entry.name === 'events') {
      yield* walkEvents(entry.path, null)
    } else if (entry.name === 'sorted') {
      yield* walkSorted(entry.path, null)
    }
  }

  // `relations/<person>/` recurses with the same rule as the archive root.
  const relations = rootEntries.find(
    (entry) => entry.name === 'relations' && entry.isDirectory
  )
  if (relations !== undefined) {
    for (const personEntry of await listEntries(relations.path)) {
      if (!personEntry.isDirectory) {
        continue
      }
      if (!onWay(personEntry.path)) {
        continue
      }
      const entries = await listEntries(personEntry.path)
      if (wanted(personEntry.path)) {
        yield report(
          {
            kind: 'person',
            person: personEntry.name,
            path: personEntry.path,
            entries,
          },
          0
        )
      }

      for (const entry of entries) {
        if (!entry.isDirectory) {
          continue
        }
        if (entry.name === 'events') {
          yield* walkEvents(entry.path, personEntry.name)
        } else if (entry.name === 'sorted') {
          yield* walkSorted(entry.path, personEntry.name)
        }
      }
    }
  }
}
