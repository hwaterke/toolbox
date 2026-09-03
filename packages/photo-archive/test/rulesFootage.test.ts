import {describe, expect, test} from 'vitest'
import type {EventScope, MediaTree, Scope} from '../src/lib/model.ts'
import {
  footageLayoutMixed,
  footageRules,
  missingDatePrefix,
  sidecarFile,
  sourceFolderCase,
  sourceFolderNesting,
  unrecognisedFile,
} from '../src/lib/rules/footage.ts'
import {runRule, type Rule} from '../src/lib/rules/types.ts'

const context = {maxDaysEarly: 1}
const ROOT = '/archive/events/2025-05-10-Iceland/footage'

/**
 * Build a footage tree from relative paths: a trailing `/` marks a folder.
 * Direct children become the tree's own entries, as the walk would build them.
 */
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

const event = (footage: MediaTree | null): EventScope => ({
  kind: 'event',
  name: '2025-05-10-Iceland',
  path: '/archive/events/2025-05-10-Iceland',
  entries: [],
  footage,
  person: null,
})

const paths = (rule: Rule, scope: Scope): string[] =>
  runRule(rule, scope, context).map((finding) => finding.path)

const on = (rule: Rule, relativePaths: string[]): string[] =>
  paths(rule, event(tree(relativePaths)))

describe('footage-layout-mixed', () => {
  test('reports loose media beside a source folder', () => {
    expect(
      on(footageLayoutMixed, ['dji/', '2025-05-10_10-00-00_IMG_1.JPG'])
    ).toStrictEqual([ROOT])
  })

  test('accepts a flat layout and a grouped one', () => {
    expect(
      on(footageLayoutMixed, ['2025-05-10_10-00-00_IMG_1.JPG'])
    ).toStrictEqual([])
    expect(
      on(footageLayoutMixed, ['dji/', 'dji/2025-05-10_10-00-00_IMG_1.JPG'])
    ).toStrictEqual([])
  })

  test('reserved folders are not source folders (T4)', () => {
    expect(
      on(footageLayoutMixed, [
        'raw_versions/',
        'panorama/',
        '2025-05-10_10-00-00_IMG_1.JPG',
      ])
    ).toStrictEqual([])
  })
})

describe('source-folder-case', () => {
  test('warns on a source folder that is not kebab-case', () => {
    expect(
      on(sourceFolderCase, ['dji/', 'dji-PANORAMA/', 'mini3/'])
    ).toStrictEqual([`${ROOT}/dji-PANORAMA`])
  })

  test('skips the reserved folders, underscore and all', () => {
    expect(on(sourceFolderCase, ['raw_versions/', 'panorama/'])).toStrictEqual(
      []
    )
  })

  test('leaves a bucket mirror to bucket-orphan-folder, so nothing doubles up', () => {
    expect(
      on(sourceFolderCase, [
        'dji-PANORAMA/',
        'raw_versions/',
        'raw_versions/dji-PANORAMA/',
      ])
    ).toStrictEqual([`${ROOT}/dji-PANORAMA`])
  })
})

describe('source-folder-nesting', () => {
  test('warns on a folder inside a source folder', () => {
    expect(on(sourceFolderNesting, ['dji/', 'dji/2025/'])).toStrictEqual([
      `${ROOT}/dji/2025`,
    ])
  })

  test('accepts a bucket mirror, and warns below it', () => {
    expect(
      on(sourceFolderNesting, ['raw_versions/', 'raw_versions/dji/'])
    ).toStrictEqual([])
    expect(
      on(sourceFolderNesting, [
        'raw_versions/',
        'raw_versions/dji/',
        'raw_versions/dji/deep/',
      ])
    ).toStrictEqual([`${ROOT}/raw_versions/dji/deep`])
  })

  test('panorama is exempt wherever it sits (T3)', () => {
    expect(
      on(sourceFolderNesting, [
        'dji/',
        'dji/panorama/',
        'raw_versions/',
        'raw_versions/panorama/',
      ])
    ).toStrictEqual([])
  })
})

describe('the three file rules', () => {
  const files = [
    '2025-05-10_10-00-00_IMG_1.JPG',
    'IMG_0002.JPG',
    'notes.txt',
    'CLIP.THM',
  ]

  test('missing-date-prefix reports media with no prefix only', () => {
    expect(on(missingDatePrefix, files)).toStrictEqual([`${ROOT}/IMG_0002.JPG`])
  })

  test('unrecognised-file reports neither media nor sidecar', () => {
    expect(on(unrecognisedFile, files)).toStrictEqual([`${ROOT}/notes.txt`])
  })

  test('sidecar-file reports the clutter, whatever its case', () => {
    expect(on(sidecarFile, files)).toStrictEqual([`${ROOT}/CLIP.THM`])
  })

  test('every file is reported by at most one of them', () => {
    const reported = [missingDatePrefix, unrecognisedFile, sidecarFile].flatMap(
      (rule) => on(rule, files)
    )
    expect(new Set(reported).size).toBe(reported.length)
  })

  test('reaches files nested in a source folder', () => {
    expect(on(missingDatePrefix, ['dji/', 'dji/IMG_0002.JPG'])).toStrictEqual([
      `${ROOT}/dji/IMG_0002.JPG`,
    ])
  })
})

describe('every footage rule', () => {
  const month: Scope = {
    kind: 'month',
    year: '2025',
    month: '05',
    path: '/archive/sorted/2025/05',
    tree: tree(['IMG_0002.JPG', 'notes.txt', 'weird/', 'weird/deep/']),
    person: null,
  }

  test('says nothing about an event with no footage/', () => {
    for (const rule of footageRules) {
      expect([rule.id, paths(rule, event(null))]).toStrictEqual([rule.id, []])
    }
  })

  test('says nothing about a sorted month', () => {
    for (const rule of footageRules) {
      expect([rule.id, paths(rule, month)]).toStrictEqual([rule.id, []])
    }
  })
})
