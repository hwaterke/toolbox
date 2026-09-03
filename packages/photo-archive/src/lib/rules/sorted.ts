import {BUCKET} from '../constants.ts'
import {isMonthFolder, isYearFolder} from '../validation.ts'
import type {Rule} from './types.ts'

/** Path below the tree root, split into its components. */
const components = (relativePath: string): string[] =>
  relativePath.split('/').filter((part) => part !== '')

/**
 * `sorted/` is years, and nothing else — a file there is reported by this rule
 * too, since there is no other shape it could be.
 */
export const sortedYearFolder: Rule = {
  id: 'sorted-year-folder',
  severity: 'error',
  title: 'sorted/ entry that is not a four-digit year',
  check: (scope) =>
    scope.kind === 'sorted' && scope.year === null
      ? scope.entries
          .filter((entry) => !entry.isDirectory || !isYearFolder(entry.name))
          .map((entry) => ({path: entry.path}))
      : [],
}

/** A year holds `01` to `12`. A file in it is `sorted-year-file`'s to report. */
export const sortedMonthFolder: Rule = {
  id: 'sorted-month-folder',
  severity: 'error',
  title: 'Year-folder entry that is not a month 01-12',
  check: (scope) =>
    scope.kind === 'sorted' && scope.year !== null
      ? scope.entries
          .filter((entry) => entry.isDirectory && !isMonthFolder(entry.name))
          .map((entry) => ({path: entry.path}))
      : [],
}

/** Media is filed into a month, never straight into the year. */
export const sortedYearFile: Rule = {
  id: 'sorted-year-file',
  severity: 'error',
  title: 'File directly in a year folder',
  check: (scope) =>
    scope.kind === 'sorted' && scope.year !== null
      ? scope.entries
          .filter((entry) => !entry.isDirectory)
          .map((entry) => ({path: entry.path}))
      : [],
}

/**
 * A month is flat: its files, plus `raw_versions/`. There are no source folders
 * in `sorted/`, so any other folder is something that does not belong.
 */
export const sortedMonthEntry: Rule = {
  id: 'sorted-month-entry',
  severity: 'error',
  title: 'Folder in a month other than raw_versions',
  check: (scope) =>
    scope.kind === 'month'
      ? scope.tree.entries
          .filter((entry) => entry.isDirectory && entry.name !== BUCKET)
          .map((entry) => ({path: entry.path}))
      : [],
}

/** Nothing mirrors in `sorted/`, so the bucket is flat as well. */
export const sortedBucketNesting: Rule = {
  id: 'sorted-bucket-nesting',
  severity: 'error',
  title: 'Sub-folder inside a sorted raw_versions/',
  check: (scope) =>
    scope.kind === 'month'
      ? scope.tree.folders
          .filter((folder) => {
            const parts = components(folder.relativePath)
            return parts.length >= 2 && parts[0] === BUCKET
          })
          .map((folder) => ({path: folder.path}))
      : [],
}

/** The sorted rules, in report order. */
export const sortedRules: readonly Rule[] = [
  sortedYearFolder,
  sortedMonthFolder,
  sortedYearFile,
  sortedMonthEntry,
  sortedBucketNesting,
]
