import {splitStem} from '@hwaterke/file-utils'
import {BUCKET, RAW_EXT_SET, RESERVED_FOLDERS} from '../constants.ts'
import {findPair, type FindPairResult, type PairCandidate} from '../findPair.ts'
import {
  scopeTree,
  type MediaTree,
  type Scope,
  type ScopeFile,
} from '../model.ts'
import type {Rule, RuleReport} from './types.ts'

/** Path below the tree root, split into its components. Empty for the root. */
const components = (relativePath: string): string[] =>
  relativePath.split('/').filter((part) => part !== '')

const isRaw = (name: string): boolean => RAW_EXT_SET.has(splitStem(name).ext)

/** True when the file sits anywhere inside the tree's `raw_versions/`. */
const inBucket = (file: ScopeFile): boolean =>
  components(file.folder)[0] === BUCKET

/**
 * Where a bucket file mirrors: `raw_versions/dji/x.DNG` mirrors `dji`, and a
 * file in the bucket root mirrors the tree root. Null for a file outside the
 * bucket.
 */
const mirrorOf = (file: ScopeFile): string | null => {
  const parts = components(file.folder)
  return parts[0] === BUCKET ? parts.slice(1).join('/') : null
}

type RawPairing = {
  file: ScopeFile
  result: FindPairResult
  /** The twin's folder below the tree root, when there is one definite twin. */
  twinFolder: string | null
}

/**
 * Every RAW in the tree, with its twin decided once. Pairing looks anywhere in
 * the tree — exact stem first, then the trailing-token pass with the 5-second
 * window — which is what makes the DJI JPG/DNG offset pair and still gives no
 * false positives on the archive's 14,408 RAWs.
 *
 * Cached against the tree object so the six rules below each pay for it once,
 * not once per rule. The tree is dropped when its scope is, and the cache entry
 * with it.
 */
const cache = new WeakMap<MediaTree, RawPairing[]>()

function pairings(tree: MediaTree): RawPairing[] {
  const cached = cache.get(tree)
  if (cached !== undefined) {
    return cached
  }
  const candidates: PairCandidate[] = tree.files.map((file) => ({
    name: file.name,
    path: file.path,
  }))
  const byPath = new Map(tree.files.map((file) => [file.path, file]))
  const result = tree.files
    .filter((file) => isRaw(file.name))
    .map((file) => {
      const found = findPair(file.name, candidates)
      const twin =
        found === null || found.method === 'ambiguous'
          ? undefined
          : byPath.get(found.photo.path)
      return {file, result: found, twinFolder: twin?.folder ?? null}
    })
  cache.set(tree, result)
  return result
}

/** Judge an event's `footage/` or a `sorted/YYYY/MM`, and nothing else. */
function overTree(check: (tree: MediaTree) => RuleReport[]): Rule['check'] {
  return (scope: Scope) => {
    const tree = scopeTree(scope)
    return tree === null ? [] : check(tree)
  }
}

/** Judge an event's `footage/` alone. */
function overEventTree(
  check: (tree: MediaTree) => RuleReport[]
): Rule['check'] {
  return (scope: Scope) =>
    scope.kind === 'event' && scope.footage !== null ? check(scope.footage) : []
}

/**
 * The bucket mirrors the source folders: a RAW whose twin sits in `dji/`
 * belongs in `raw_versions/dji/`. The twin's folder is what decides this, which
 * is why `findPair` returns a path and not just a name (T2). A flat `footage/`
 * and a `sorted/YYYY/MM` mirror the tree root, so both are silent here.
 */
export const bucketNotMirrored: Rule = {
  id: 'bucket-not-mirrored',
  severity: 'error',
  title: 'RAW in raw_versions/ does not mirror its twin’s folder',
  check: overTree((tree) => {
    const reports: RuleReport[] = []
    for (const {file, twinFolder} of pairings(tree)) {
      const mirror = mirrorOf(file)
      if (mirror === null || twinFolder === null || twinFolder === mirror) {
        continue
      }
      reports.push({
        path: file.path,
        detail: `expected ${[BUCKET, twinFolder].filter((part) => part !== '').join('/')}`,
      })
    }
    return reports
  }),
}

/**
 * A mirror folder for a source folder that is not there any more. Events only:
 * `sorted/` has no source folders to mirror, so a sub-folder in its bucket is
 * `sorted-bucket-nesting`, and reporting it here as well would say the same
 * thing twice.
 */
export const bucketOrphanFolder: Rule = {
  id: 'bucket-orphan-folder',
  severity: 'error',
  title: 'raw_versions/ sub-folder with no matching source folder',
  check: overEventTree((tree) => {
    const sources = new Set(
      tree.folders
        .filter(
          (folder) =>
            components(folder.relativePath).length === 1 &&
            !RESERVED_FOLDERS.has(folder.name)
        )
        .map((folder) => folder.name)
    )
    return tree.folders
      .filter((folder) => {
        const parts = components(folder.relativePath)
        return (
          parts.length === 2 &&
          parts[0] === BUCKET &&
          !folder.isPanorama &&
          !sources.has(parts[1]!)
        )
      })
      .map((folder) => ({path: folder.path}))
  }),
}

/** The bucket holds RAWs. Anything else is excluded from Immich by mistake. */
export const bucketNonRaw: Rule = {
  id: 'bucket-non-raw',
  severity: 'error',
  title: 'A non-RAW file inside raw_versions/',
  check: overTree((tree) =>
    tree.files
      .filter((file) => inBucket(file) && !isRaw(file.name))
      .map((file) => ({path: file.path}))
  ),
}

/**
 * A RAW is only excluded from Immich because a viewable twin stands in for it.
 * With no twin anywhere in scope, the shot is invisible in the library.
 */
export const rawOrphan: Rule = {
  id: 'raw-orphan',
  severity: 'error',
  title: 'RAW in raw_versions/ with no viewable twin',
  check: overTree((tree) =>
    pairings(tree)
      .filter(({file, result}) => inBucket(file) && result === null)
      .map(({file}) => ({path: file.path}))
  ),
}

/** The mirror image: a twin exists, so the RAW should be in the bucket. */
export const rawLoosePair: Rule = {
  id: 'raw-loose-pair',
  severity: 'warning',
  title: 'RAW outside raw_versions/ that has a viewable twin',
  check: overTree((tree) =>
    pairings(tree)
      .filter(
        ({file, result}) =>
          !inBucket(file) && result !== null && result.method !== 'ambiguous'
      )
      .map(({file, result}) => ({
        path: file.path,
        ...(result !== null && result.method !== 'ambiguous'
          ? {detail: `twin ${result.photo.name}`}
          : {}),
      }))
  ),
}

/** Two candidates in the 5-second window: never guess, report it (decision 6). */
export const rawAmbiguousPair: Rule = {
  id: 'raw-ambiguous-pair',
  severity: 'warning',
  title: 'RAW with more than one pass-2 candidate',
  check: overTree((tree) =>
    pairings(tree)
      .filter(({result}) => result?.method === 'ambiguous')
      .map(({file, result}) => ({
        path: file.path,
        ...(result?.method === 'ambiguous'
          ? {
              detail: result.candidates
                .map((candidate) => candidate.name)
                .join(', '),
            }
          : {}),
      }))
  ),
}

/** The bucket and pairing rules, in report order. */
export const bucketRules: readonly Rule[] = [
  bucketNotMirrored,
  bucketOrphanFolder,
  bucketNonRaw,
  rawOrphan,
  rawLoosePair,
  rawAmbiguousPair,
]
