import {describe, expect, test} from 'vitest'
import type {
  PersonScope,
  RootScope,
  Scope,
  ScopeEntry,
} from '../src/lib/model.ts'
import {
  personFolderEmpty,
  personFolderMedia,
  personFolderUnknown,
  rootFile,
  rootRules,
  rootUnknownFolder,
} from '../src/lib/rules/root.ts'
import {runRule, type Rule} from '../src/lib/rules/types.ts'

const context = {maxDaysEarly: 1}

const folder = (parent: string, name: string): ScopeEntry => ({
  name,
  path: `${parent}/${name}`,
  isDirectory: true,
})

const file = (parent: string, name: string): ScopeEntry => ({
  name,
  path: `${parent}/${name}`,
  isDirectory: false,
})

const root = (entries: ScopeEntry[]): RootScope => ({
  kind: 'root',
  path: '/archive',
  entries,
})

const person = (entries: ScopeEntry[]): PersonScope => ({
  kind: 'person',
  person: 'sarah',
  path: '/archive/relations/sarah',
  entries,
})

const paths = (rule: Rule, scope: Scope): string[] =>
  runRule(rule, scope, context).map((finding) => finding.path)

describe('root-file', () => {
  test('reports visible files and leaves folders alone', () => {
    const scope = root([
      folder('/archive', 'events'),
      folder('/archive', 'ai'),
      file('/archive', 'notes.txt'),
    ])

    expect(paths(rootFile, scope)).toStrictEqual(['/archive/notes.txt'])
  })

  test('a clean root reports nothing', () => {
    const scope = root([
      folder('/archive', 'events'),
      folder('/archive', 'sorted'),
      folder('/archive', 'relations'),
    ])

    expect(paths(rootFile, scope)).toStrictEqual([])
  })
})

describe('root-unknown-folder', () => {
  test('reports folders outside the three linted roots', () => {
    const scope = root([
      folder('/archive', '3dprinting'),
      folder('/archive', 'ai'),
      folder('/archive', 'events'),
      folder('/archive', 'relations'),
      folder('/archive', 'sorted'),
      file('/archive', 'notes.txt'),
    ])

    expect(paths(rootUnknownFolder, scope)).toStrictEqual([
      '/archive/3dprinting',
      '/archive/ai',
    ])
  })

  test('is info, so a run of only these still passes', () => {
    const scope = root([folder('/archive', 'ai')])
    expect(runRule(rootUnknownFolder, scope, context)[0]?.severity).toBe('info')
  })
})

describe('person-folder-empty', () => {
  test('reports the folder itself when it holds nothing', () => {
    expect(paths(personFolderEmpty, person([]))).toStrictEqual([
      '/archive/relations/sarah',
    ])
  })

  test('says nothing when the folder holds something', () => {
    const scope = person([folder('/archive/relations/sarah', 'events')])
    expect(paths(personFolderEmpty, scope)).toStrictEqual([])
  })
})

describe('person-folder-media', () => {
  test('reports media sitting directly in the person folder', () => {
    const base = '/archive/relations/sarah'
    const scope = person([
      folder(base, 'events'),
      file(base, 'IMG_0001.JPG'),
      file(base, 'clip.MP4'),
      file(base, 'README.md'),
    ])

    expect(paths(personFolderMedia, scope)).toStrictEqual([
      `${base}/IMG_0001.JPG`,
      `${base}/clip.MP4`,
    ])
  })
})

describe('person-folder-unknown', () => {
  test('reports anything beside events/ and sorted/', () => {
    const base = '/archive/relations/sarah'
    const scope = person([
      folder(base, 'events'),
      folder(base, 'sorted'),
      folder(base, 'to-sort'),
      file(base, 'README.md'),
    ])

    expect(paths(personFolderUnknown, scope)).toStrictEqual([
      `${base}/to-sort`,
      `${base}/README.md`,
    ])
  })

  test('leaves media to person-folder-media, so nothing is reported twice', () => {
    const base = '/archive/relations/sarah'
    const scope = person([file(base, 'IMG_0001.JPG')])

    expect(paths(personFolderUnknown, scope)).toStrictEqual([])
    expect(paths(personFolderMedia, scope)).toStrictEqual([
      `${base}/IMG_0001.JPG`,
    ])
  })
})

describe('every root rule', () => {
  const otherScope: Scope = {
    kind: 'event',
    name: '2025-05-10-Iceland',
    path: '/archive/events/2025-05-10-Iceland',
    entries: [file('/archive/events/2025-05-10-Iceland', 'IMG_0001.JPG')],
    footage: null,
    person: null,
  }

  test('says nothing about a scope of another kind', () => {
    for (const rule of rootRules) {
      expect([rule.id, paths(rule, otherScope)]).toStrictEqual([rule.id, []])
    }
  })

  test('names the scope it judged', () => {
    const scope = person([])
    expect(runRule(personFolderEmpty, scope, context)[0]?.scope).toBe(
      'relations/sarah'
    )
  })
})
