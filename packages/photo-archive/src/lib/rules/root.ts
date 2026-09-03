import {splitStem} from '@hwaterke/file-utils'
import {LINTED_ROOTS, MEDIA_EXT_SET} from '../constants.ts'
import type {ScopeEntry} from '../model.ts'
import type {Rule} from './types.ts'

const LINTED_ROOT_SET: ReadonlySet<string> = new Set(LINTED_ROOTS)

/** True for a visible file whose extension `ingest` would move. */
function isMediaFile(entry: ScopeEntry): boolean {
  return !entry.isDirectory && MEDIA_EXT_SET.has(splitStem(entry.name).ext)
}

/**
 * The archive root holds folders and nothing else. `fs-ignore` and dotfiles
 * never reach a rule: the walk filters them out before the scope is built.
 */
export const rootFile: Rule = {
  id: 'root-file',
  severity: 'error',
  title: 'Visible file at the archive root',
  check: (scope) =>
    scope.kind === 'root'
      ? scope.entries
          .filter((entry) => !entry.isDirectory)
          .map((entry) => ({path: entry.path}))
      : [],
}

/**
 * Info, not an error: `ai`, `3dprinting` and `album-icons` are legitimately
 * outside `lint`'s remit, and listing them is what keeps a typo'd folder
 * visible without hardcoding the ones that exist today.
 */
export const rootUnknownFolder: Rule = {
  id: 'root-unknown-folder',
  severity: 'info',
  title: 'Top-level folder that is not events/, sorted/ or relations/',
  check: (scope) =>
    scope.kind === 'root'
      ? scope.entries
          .filter(
            (entry) => entry.isDirectory && !LINTED_ROOT_SET.has(entry.name)
          )
          .map((entry) => ({path: entry.path, detail: 'not linted'}))
      : [],
}

/** An empty person folder is left-over structure, not a person. */
export const personFolderEmpty: Rule = {
  id: 'person-folder-empty',
  severity: 'error',
  title: 'Person folder with nothing in it',
  check: (scope) =>
    scope.kind === 'person' && scope.entries.length === 0
      ? [{path: scope.path}]
      : [],
}

/** Media belongs in an event or in `sorted/`, never loose in a person folder. */
export const personFolderMedia: Rule = {
  id: 'person-folder-media',
  severity: 'error',
  title: 'Media file directly in a person folder',
  check: (scope) =>
    scope.kind === 'person'
      ? scope.entries.filter(isMediaFile).map((entry) => ({path: entry.path}))
      : [],
}

/**
 * A person folder recurses with the same rule as the archive root, so anything
 * beside `events/` and `sorted/` is reported the same way — as info. A media
 * file is left to `person-folder-media`, which is an error, so nothing is
 * reported twice.
 */
export const personFolderUnknown: Rule = {
  id: 'person-folder-unknown',
  severity: 'info',
  title: 'Person folder entry that is not events/ or sorted/',
  check: (scope) =>
    scope.kind === 'person'
      ? scope.entries
          .filter(
            (entry) =>
              entry.name !== 'events' &&
              entry.name !== 'sorted' &&
              !isMediaFile(entry)
          )
          .map((entry) => ({path: entry.path, detail: 'not linted'}))
      : [],
}

/** The root and relations rules, in report order. */
export const rootRules: readonly Rule[] = [
  rootFile,
  rootUnknownFolder,
  personFolderEmpty,
  personFolderMedia,
  personFolderUnknown,
]
