import {splitStem} from '@hwaterke/file-utils'
import {
  BUCKET,
  MEDIA_EXT_SET,
  RESERVED_FOLDERS,
  SIDECAR_EXT_SET,
} from '../constants.ts'
import type {MediaTree, Scope} from '../model.ts'
import {parseTimestampedName} from '../names.ts'
import {classifyFootage} from '../preflight.ts'
import {isKebabCase} from '../validation.ts'
import type {Rule, RuleReport} from './types.ts'

/**
 * These rules judge an event's `footage/` only. `sorted/YYYY/MM` holds nothing
 * but already-renamed files and its bucket, so it is left to the sorted rules
 * and to the bucket and pairing rules, which run against both.
 */
function footageOf(scope: Scope): MediaTree | null {
  return scope.kind === 'event' ? scope.footage : null
}

/** Judge a footage tree, or say nothing for any other scope. */
function overFootage(check: (tree: MediaTree) => RuleReport[]): Rule['check'] {
  return (scope) => {
    const tree = footageOf(scope)
    return tree === null ? [] : check(tree)
  }
}

/** Path below the tree root, split into its components. */
const components = (relativePath: string): string[] =>
  relativePath.split('/').filter((part) => part !== '')

/**
 * Loose media beside source folders: `ingest` cannot tell where a new file
 * belongs, so the event has to pick one layout. Reserved folders do not count
 * as source folders (T4).
 */
export const footageLayoutMixed: Rule = {
  id: 'footage-layout-mixed',
  severity: 'error',
  title: 'footage/ mixes loose media and source folders',
  check: overFootage((tree) =>
    classifyFootage(tree.entries) === 'mixed' ? [{path: tree.path}] : []
  ),
}

/**
 * Only the source folders themselves are judged. A mirror inside
 * `raw_versions/` copies its source's name, so judging it too would report the
 * same badly-cased name twice; a mirror that does *not* match a source is
 * `bucket-orphan-folder`'s to report.
 */
export const sourceFolderCase: Rule = {
  id: 'source-folder-case',
  severity: 'warning',
  title: 'Source folder is not kebab-case',
  check: overFootage((tree) =>
    tree.folders
      .filter(
        (folder) =>
          components(folder.relativePath).length === 1 &&
          !RESERVED_FOLDERS.has(folder.name) &&
          !isKebabCase(folder.name)
      )
      .map((folder) => ({path: folder.path}))
  ),
}

/**
 * `footage/` is one level of source folders and nothing deeper. The two
 * exceptions are the bucket's mirrors (`raw_versions/<source>`) and `panorama`,
 * whose sets legitimately nest one level further (T3).
 */
export const sourceFolderNesting: Rule = {
  id: 'source-folder-nesting',
  severity: 'warning',
  title: 'A folder inside a source folder',
  check: overFootage((tree) =>
    tree.folders
      .filter((folder) => {
        const parts = components(folder.relativePath)
        if (parts.length < 2 || folder.isPanorama) {
          return false
        }
        return !(parts.length === 2 && parts[0] === BUCKET)
      })
      .map((folder) => ({path: folder.path}))
  ),
}

/** Everything under `footage/` is renamed by `exif-datify` before it is filed. */
export const missingDatePrefix: Rule = {
  id: 'missing-date-prefix',
  severity: 'warning',
  title: 'Media with no YYYY-MM-DD_HH-mm-ss_ prefix',
  check: overFootage((tree) =>
    tree.files
      .filter((file) => {
        const {stem, ext} = splitStem(file.name)
        return MEDIA_EXT_SET.has(ext) && parseTimestampedName(stem) === null
      })
      .map((file) => ({path: file.path}))
  ),
}

/** Neither media nor a known sidecar: nobody knows what it is doing here. */
export const unrecognisedFile: Rule = {
  id: 'unrecognised-file',
  severity: 'warning',
  title: 'File in footage/ of an unknown type',
  check: overFootage((tree) =>
    tree.files
      .filter((file) => {
        const {ext} = splitStem(file.name)
        return !MEDIA_EXT_SET.has(ext) && !SIDECAR_EXT_SET.has(ext)
      })
      .map((file) => ({path: file.path}))
  ),
}

/** A known kind of clutter, reported as a backlog to delete rather than a mystery. */
export const sidecarFile: Rule = {
  id: 'sidecar-file',
  severity: 'warning',
  title: 'Sidecar clutter (.thm / .xmp / .aae) in footage/',
  check: overFootage((tree) =>
    tree.files
      .filter((file) => SIDECAR_EXT_SET.has(splitStem(file.name).ext))
      .map((file) => ({path: file.path}))
  ),
}

/** The footage rules, in report order. */
export const footageRules: readonly Rule[] = [
  footageLayoutMixed,
  sourceFolderCase,
  sourceFolderNesting,
  missingDatePrefix,
  unrecognisedFile,
  sidecarFile,
]
