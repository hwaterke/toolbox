import {describe, expect, test} from 'vitest'
import type {
  MediaTree,
  MonthScope,
  Scope,
  ScopeEntry,
  SortedScope,
} from '../src/lib/model.ts'
import {
  bucketNonRaw,
  bucketNotMirrored,
  bucketOrphanFolder,
  rawOrphan,
} from '../src/lib/rules/bucket.ts'
import {
  sortedBucketNesting,
  sortedMonthEntry,
  sortedMonthFolder,
  sortedRules,
  sortedYearFile,
  sortedYearFolder,
} from '../src/lib/rules/sorted.ts'
import {runRule, type Rule} from '../src/lib/rules/types.ts'

const context = {maxDaysEarly: 1}
const MONTH = '/archive/sorted/2025/05'

const DNG = '2025-05-10_15-26-02_DJI_0004.DNG'
const JPG = '2025-05-10_15-26-03_DJI_0004.JPG'

const entry = (
  parent: string,
  name: string,
  isDirectory = true
): ScopeEntry => ({
  name,
  path: `${parent}/${name}`,
  isDirectory,
})

const sorted = (year: string | null, entries: ScopeEntry[]): SortedScope => ({
  kind: 'sorted',
  year,
  path: year === null ? '/archive/sorted' : `/archive/sorted/${year}`,
  entries,
  person: null,
})

/** Build a month tree from relative paths; a trailing `/` marks a folder. */
const monthTree = (relativePaths: string[]): MediaTree => {
  const folders: MediaTree['folders'] = []
  const files: MediaTree['files'] = []
  const entries: MediaTree['entries'] = []

  for (const raw of relativePaths) {
    const isDirectory = raw.endsWith('/')
    const relativePath = isDirectory ? raw.slice(0, -1) : raw
    const parts = relativePath.split('/')
    const name = parts.at(-1)!
    const path = `${MONTH}/${relativePath}`

    if (parts.length === 1) {
      entries.push({name, path, isDirectory})
    }
    if (isDirectory) {
      folders.push({name, path, relativePath, isPanorama: name === 'panorama'})
    } else {
      files.push({
        name,
        path,
        relativePath,
        folder: parts.slice(0, -1).join('/'),
      })
    }
  }

  return {path: MONTH, entries, folders, files}
}

const month = (relativePaths: string[]): MonthScope => ({
  kind: 'month',
  year: '2025',
  month: '05',
  path: MONTH,
  tree: monthTree(relativePaths),
  person: null,
})

const paths = (rule: Rule, scope: Scope): string[] =>
  runRule(rule, scope, context).map((finding) => finding.path)

describe('sorted-year-folder', () => {
  test('accepts four-digit years and reports everything else', () => {
    const scope = sorted(null, [
      entry('/archive/sorted', '2003'),
      entry('/archive/sorted', '2026'),
      entry('/archive/sorted', 'misc'),
      entry('/archive/sorted', '202'),
      entry('/archive/sorted', 'notes.txt', false),
    ])

    expect(paths(sortedYearFolder, scope)).toStrictEqual([
      '/archive/sorted/misc',
      '/archive/sorted/202',
      '/archive/sorted/notes.txt',
    ])
  })

  test('says nothing about a year folder', () => {
    const scope = sorted('2025', [entry('/archive/sorted/2025', 'oops')])
    expect(paths(sortedYearFolder, scope)).toStrictEqual([])
  })
})

describe('sorted-month-folder', () => {
  test('accepts 01 to 12 and reports the rest', () => {
    const base = '/archive/sorted/2025'
    const scope = sorted('2025', [
      entry(base, '01'),
      entry(base, '12'),
      entry(base, '00'),
      entry(base, '13'),
      entry(base, '5'),
      entry(base, 'summer'),
    ])

    expect(paths(sortedMonthFolder, scope)).toStrictEqual([
      `${base}/00`,
      `${base}/13`,
      `${base}/5`,
      `${base}/summer`,
    ])
  })

  test('leaves a loose file to sorted-year-file, so nothing doubles up', () => {
    const base = '/archive/sorted/2025'
    const scope = sorted('2025', [entry(base, JPG, false)])

    expect(paths(sortedMonthFolder, scope)).toStrictEqual([])
    expect(paths(sortedYearFile, scope)).toStrictEqual([`${base}/${JPG}`])
  })
})

describe('sorted-month-entry', () => {
  test('accepts raw_versions/ and reports any other folder', () => {
    const scope = month([JPG, 'raw_versions/', 'panorama/', 'dji/'])

    expect(paths(sortedMonthEntry, scope)).toStrictEqual([
      `${MONTH}/panorama`,
      `${MONTH}/dji`,
    ])
  })
})

describe('sorted-bucket-nesting', () => {
  test('reports a folder inside the sorted bucket', () => {
    const scope = month(['raw_versions/', 'raw_versions/dji/'])
    expect(paths(sortedBucketNesting, scope)).toStrictEqual([
      `${MONTH}/raw_versions/dji`,
    ])
  })

  test('accepts a flat bucket', () => {
    const scope = month([JPG, 'raw_versions/', `raw_versions/${DNG}`])
    expect(paths(sortedBucketNesting, scope)).toStrictEqual([])
  })
})

describe('the bucket and pairing rules over a month', () => {
  test('report an orphan RAW and a non-RAW in the sorted bucket', () => {
    const scope = month([
      'raw_versions/',
      `raw_versions/${DNG}`,
      `raw_versions/${JPG}`,
    ])

    expect(paths(bucketNonRaw, scope)).toStrictEqual([
      `${MONTH}/raw_versions/${JPG}`,
    ])
    expect(paths(rawOrphan, scope)).toStrictEqual([])
  })

  test('report a bucketed RAW with no twin in the month', () => {
    const scope = month(['raw_versions/', `raw_versions/${DNG}`])
    expect(paths(rawOrphan, scope)).toStrictEqual([
      `${MONTH}/raw_versions/${DNG}`,
    ])
  })

  test('a nested sorted bucket is reported once, as nesting', () => {
    const scope = month(['raw_versions/', 'raw_versions/dji/'])

    expect(paths(sortedBucketNesting, scope)).toStrictEqual([
      `${MONTH}/raw_versions/dji`,
    ])
    expect(paths(bucketOrphanFolder, scope)).toStrictEqual([])
  })

  test('a flat month mirrors the bucket root, so nothing is not-mirrored', () => {
    const scope = month([JPG, 'raw_versions/', `raw_versions/${DNG}`])
    expect(paths(bucketNotMirrored, scope)).toStrictEqual([])
  })
})

describe('every sorted rule', () => {
  const otherScope: Scope = {
    kind: 'event',
    name: '2025-05-10-Iceland',
    path: '/archive/events/2025-05-10-Iceland',
    entries: [entry('/archive/events/2025-05-10-Iceland', 'notes.txt', false)],
    footage: monthTree(['dji/', `dji/${JPG}`]),
    person: null,
  }

  test('says nothing about a scope of another kind', () => {
    for (const rule of sortedRules) {
      expect([rule.id, paths(rule, otherScope)]).toStrictEqual([rule.id, []])
    }
  })

  test('says nothing about a month that is already correct', () => {
    const clean = month([JPG, 'raw_versions/', `raw_versions/${DNG}`])
    for (const rule of sortedRules) {
      expect([rule.id, paths(rule, clean)]).toStrictEqual([rule.id, []])
    }
  })
})
