import {describe, expect, test} from 'vitest'
import type {EventScope, MediaTree, Scope} from '../src/lib/model.ts'
import {
  bucketNonRaw,
  bucketNotMirrored,
  bucketOrphanFolder,
  bucketRules,
  rawAmbiguousPair,
  rawLoosePair,
  rawOrphan,
} from '../src/lib/rules/bucket.ts'
import {runRule, type Rule} from '../src/lib/rules/types.ts'

const context = {maxDaysEarly: 1}
const ROOT = '/archive/events/2025-05-10-Iceland/footage'

/** The DJI case: the JPG is written one second after the DNG. */
const DNG = '2025-05-10_15-26-02_DJI_0004.DNG'
const JPG = '2025-05-10_15-26-03_DJI_0004.JPG'

/** Build a tree from relative paths; a trailing `/` marks a folder. */
const tree = (relativePaths: string[]): MediaTree => {
  const folders: MediaTree['folders'] = []
  const files: MediaTree['files'] = []
  const entries: MediaTree['entries'] = []

  for (const raw of relativePaths) {
    const isDirectory = raw.endsWith('/')
    const relativePath = isDirectory ? raw.slice(0, -1) : raw
    const parts = relativePath.split('/')
    const name = parts.at(-1)!
    const path = `${ROOT}/${relativePath}`

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

  return {path: ROOT, entries, folders, files}
}

const event = (footage: MediaTree): EventScope => ({
  kind: 'event',
  name: '2025-05-10-Iceland',
  path: '/archive/events/2025-05-10-Iceland',
  entries: [],
  footage,
  person: null,
})

const findings = (rule: Rule, relativePaths: string[]) =>
  runRule(rule, event(tree(relativePaths)), context)

const on = (rule: Rule, relativePaths: string[]): string[] =>
  findings(rule, relativePaths).map((finding) => finding.path)

describe('the DJI one-second offset', () => {
  test('pairs a 15-26-02 DNG with a 15-26-03 JPG', () => {
    const [finding] = findings(rawLoosePair, [JPG, DNG])
    expect(finding?.path).toBe(`${ROOT}/${DNG}`)
    expect(finding?.detail).toBe(`twin ${JPG}`)
  })

  test('does not pair across a gap wider than the window', () => {
    const far = '2025-05-10_15-26-59_DJI_0004.JPG'
    expect(on(rawLoosePair, [far, DNG])).toStrictEqual([])
  })

  test('does not pair a different trailing token', () => {
    const other = '2025-05-10_15-26-03_DJI_0009.JPG'
    expect(on(rawLoosePair, [other, DNG])).toStrictEqual([])
  })
})

describe('bucket-not-mirrored', () => {
  test('reports a RAW in the bucket root whose twin sits in a source folder', () => {
    const [finding] = findings(bucketNotMirrored, [
      'dji/',
      `dji/${JPG}`,
      'raw_versions/',
      `raw_versions/${DNG}`,
    ])

    expect(finding?.path).toBe(`${ROOT}/raw_versions/${DNG}`)
    expect(finding?.detail).toBe('expected raw_versions/dji')
  })

  test('accepts a bucket that does mirror', () => {
    expect(
      on(bucketNotMirrored, [
        'dji/',
        `dji/${JPG}`,
        'raw_versions/',
        'raw_versions/dji/',
        `raw_versions/dji/${DNG}`,
      ])
    ).toStrictEqual([])
  })

  test('accepts a flat layout, where the bucket root is the mirror', () => {
    expect(
      on(bucketNotMirrored, [JPG, 'raw_versions/', `raw_versions/${DNG}`])
    ).toStrictEqual([])
  })

  test('reports a RAW mirrored into the wrong source folder', () => {
    const [finding] = findings(bucketNotMirrored, [
      'dji/',
      `dji/${JPG}`,
      'mini3/',
      'raw_versions/',
      'raw_versions/mini3/',
      `raw_versions/mini3/${DNG}`,
    ])

    expect(finding?.detail).toBe('expected raw_versions/dji')
  })
})

describe('bucket-orphan-folder', () => {
  test('reports a mirror with no source folder', () => {
    expect(
      on(bucketOrphanFolder, ['dji/', 'raw_versions/', 'raw_versions/mini3/'])
    ).toStrictEqual([`${ROOT}/raw_versions/mini3`])
  })

  test('accepts a mirror that matches, and panorama (T3)', () => {
    expect(
      on(bucketOrphanFolder, [
        'dji/',
        'raw_versions/',
        'raw_versions/dji/',
        'raw_versions/panorama/',
      ])
    ).toStrictEqual([])
  })
})

describe('bucket-non-raw', () => {
  test('reports a photo filed into the bucket', () => {
    expect(
      on(bucketNonRaw, [
        'raw_versions/',
        `raw_versions/${JPG}`,
        `raw_versions/${DNG}`,
      ])
    ).toStrictEqual([`${ROOT}/raw_versions/${JPG}`])
  })
})

describe('raw-orphan', () => {
  test('reports a bucketed RAW with no twin anywhere in the tree', () => {
    expect(
      on(rawOrphan, ['raw_versions/', `raw_versions/${DNG}`])
    ).toStrictEqual([`${ROOT}/raw_versions/${DNG}`])
  })

  test('says nothing when the twin is in another folder of the tree', () => {
    expect(
      on(rawOrphan, [
        'dji/',
        `dji/${JPG}`,
        'raw_versions/',
        `raw_versions/${DNG}`,
      ])
    ).toStrictEqual([])
  })

  test('a lone RAW outside the bucket is not an orphan', () => {
    expect(on(rawOrphan, [DNG])).toStrictEqual([])
  })
})

describe('raw-ambiguous-pair', () => {
  const second = '2025-05-10_15-26-04_DJI_0004.JPG'

  test('reports two candidates inside the window and names them', () => {
    const [finding] = findings(rawAmbiguousPair, [JPG, second, DNG])
    expect(finding?.path).toBe(`${ROOT}/${DNG}`)
    expect(finding?.detail).toBe(`${JPG}, ${second}`)
  })

  test('is never also an orphan or a loose pair', () => {
    const files = ['raw_versions/', `raw_versions/${DNG}`, JPG, second]
    expect(on(rawAmbiguousPair, files)).toHaveLength(1)
    expect(on(rawOrphan, files)).toStrictEqual([])
    expect(on(rawLoosePair, files)).toStrictEqual([])
  })
})

describe('every bucket rule', () => {
  const otherScope: Scope = {
    kind: 'person',
    person: 'sarah',
    path: '/archive/relations/sarah',
    entries: [],
  }

  test('says nothing about a scope with no media tree', () => {
    for (const rule of bucketRules) {
      expect([rule.id, runRule(rule, otherScope, context)]).toStrictEqual([
        rule.id,
        [],
      ])
    }
  })

  test('says nothing about a tree that is already correct', () => {
    const clean = [
      'dji/',
      `dji/${JPG}`,
      'raw_versions/',
      'raw_versions/dji/',
      `raw_versions/dji/${DNG}`,
    ]
    for (const rule of bucketRules) {
      expect([rule.id, on(rule, clean)]).toStrictEqual([rule.id, []])
    }
  })
})
