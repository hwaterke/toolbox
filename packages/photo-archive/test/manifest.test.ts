import {afterEach, beforeEach, describe, expect, test} from 'vitest'
import {
  logPath,
  Manifest,
  manifestPath,
  readManifest,
} from '../src/lib/manifest.ts'
import {makeTempTree, type TempTree} from './utils/tempArchive.ts'

let tree: TempTree

beforeEach(async () => {
  tree = await makeTempTree()
})

afterEach(async () => {
  await tree.cleanup()
})

describe('Manifest', () => {
  test('appends one JSON object per line and reads back', async () => {
    const manifest = new Manifest(tree.path('run.jsonl'))
    await manifest.append({
      at: '2026-09-02T10:00:00.000Z',
      from: '/a',
      to: '/b',
    })
    await manifest.append({
      at: '2026-09-02T10:00:01.000Z',
      from: '/c',
      to: '/d',
    })
    await manifest.close()

    const raw = await tree.read('run.jsonl')
    expect(raw.split('\n').filter((l) => l !== '')).toHaveLength(2)

    const entries = await readManifest(tree.path('run.jsonl'))
    expect(entries).toEqual([
      {at: '2026-09-02T10:00:00.000Z', from: '/a', to: '/b'},
      {at: '2026-09-02T10:00:01.000Z', from: '/c', to: '/d'},
    ])
  })

  test('is empty until the first append, and creates no file', async () => {
    const manifest = new Manifest(tree.path('run.jsonl'))
    expect(manifest.isEmpty).toBe(true)
    await manifest.close()
    await expect(tree.read('run.jsonl')).rejects.toThrow()
  })

  test('creates the directory it is asked to write into', async () => {
    const manifest = new Manifest(tree.path('logs/deep/run.jsonl'))
    await manifest.append({at: 'now', from: '/a', to: '/b'})
    await manifest.close()
    expect(await readManifest(tree.path('logs/deep/run.jsonl'))).toHaveLength(1)
  })

  test('appends rather than truncating on reopen', async () => {
    const first = new Manifest(tree.path('run.jsonl'))
    await first.append({at: 'a', from: '/1', to: '/2'})
    await first.close()
    const second = new Manifest(tree.path('run.jsonl'))
    await second.append({at: 'b', from: '/3', to: '/4'})
    await second.close()
    expect(await readManifest(tree.path('run.jsonl'))).toHaveLength(2)
  })

  test('a path containing a newline stays on one line', async () => {
    const manifest = new Manifest(tree.path('run.jsonl'))
    await manifest.append({at: 'a', from: '/od\nd', to: '/b'})
    await manifest.close()
    const entries = await readManifest(tree.path('run.jsonl'))
    expect(entries).toEqual([{at: 'a', from: '/od\nd', to: '/b'}])
  })
})

describe('readManifest', () => {
  test('ignores blank lines', async () => {
    await tree.file(
      'run.jsonl',
      '{"at":"a","from":"/1","to":"/2"}\n\n{"at":"b","from":"/3","to":"/4"}\n'
    )
    expect(await readManifest(tree.path('run.jsonl'))).toHaveLength(2)
  })

  test('refuses a malformed line, naming it', async () => {
    await tree.file('run.jsonl', '{"at":"a","from":"/1","to":"/2"}\nnope\n')
    await expect(readManifest(tree.path('run.jsonl'))).rejects.toThrow(/:2 /)
  })

  test('refuses a JSON line that is not a manifest entry', async () => {
    await tree.file('run.jsonl', '{"hello":"world"}\n')
    await expect(readManifest(tree.path('run.jsonl'))).rejects.toThrow(
      /not a manifest entry/
    )
  })
})

describe('file naming', () => {
  const when = new Date(2026, 8, 2, 21, 45, 6)

  test('the manifest is timestamped in the given directory', () => {
    expect(manifestPath('/logs', when)).toBe(
      '/logs/photo-archive_20260902-214506.manifest.jsonl'
    )
  })

  test('the log shares the stamp', () => {
    expect(logPath('/logs', when)).toBe(
      '/logs/photo-archive_20260902-214506.log'
    )
  })
})
