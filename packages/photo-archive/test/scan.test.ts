import {afterEach, beforeEach, describe, expect, test} from 'vitest'
import {MEDIA_EXTS} from '../src/lib/constants.ts'
import {scanSource} from '../src/lib/scan.ts'
import {makeTempTree, type TempTree} from './utils/tempArchive.ts'

let tree: TempTree

beforeEach(async () => {
  tree = await makeTempTree()
})

afterEach(async () => {
  await tree.cleanup()
})

const names = (files: {name: string}[]) => files.map((f) => f.name).sort()

describe('scanSource', () => {
  test('finds media anywhere in the tree and flattens it', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await tree.file('src/deep/nested/2025-05-10_10-00-01_B.JPG')
    const result = await scanSource(tree.path('src'))
    expect(names(result.files)).toEqual([
      '2025-05-10_10-00-00_A.JPG',
      '2025-05-10_10-00-01_B.JPG',
    ])
    expect(result.rejected).toEqual([])
  })

  test('accepts every media extension', async () => {
    for (const ext of MEDIA_EXTS) {
      await tree.file(`src/2025-05-10_10-00-00_A.${ext}`)
    }
    const result = await scanSource(tree.path('src'))
    expect(result.files).toHaveLength(MEDIA_EXTS.length)
    expect(result.rejected).toEqual([])
  })

  test('accepts the legacy camcorder formats', async () => {
    for (const ext of ['mpg', 'mts', 'avi']) {
      await tree.file(`src/2025-05-10_10-00-00_A.${ext}`)
    }
    const result = await scanSource(tree.path('src'))
    expect(result.files).toHaveLength(3)
    expect(result.rejected).toEqual([])
  })

  test('extensions are matched case-insensitively', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JpEg')
    const result = await scanSource(tree.path('src'))
    expect(result.files).toHaveLength(1)
  })

  test('rejects an unknown type and leaves it in place', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await tree.file('src/2025-05-10_10-00-00_A.AAE')
    await tree.file('src/notes.txt')
    const result = await scanSource(tree.path('src'))
    expect(names(result.files)).toEqual(['2025-05-10_10-00-00_A.JPG'])
    expect(names(result.rejected)).toEqual([
      '2025-05-10_10-00-00_A.AAE',
      'notes.txt',
    ])
    expect(result.rejected.every((r) => r.reason === 'unknown_type')).toBe(true)
  })

  test('rejects media with no date prefix (decision 3)', async () => {
    await tree.file('src/DSC_0001.NEF')
    const result = await scanSource(tree.path('src'))
    expect(result.files).toEqual([])
    expect(result.rejected).toMatchObject([{reason: 'no_date_prefix'}])
  })

  test('an invalid date is a no_date_prefix reject, not a crash', async () => {
    await tree.file('src/2025-02-30_10-00-00_A.JPG')
    const result = await scanSource(tree.path('src'))
    expect(result.rejected).toMatchObject([{reason: 'no_date_prefix'}])
  })

  test('marks RAWs', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.NEF')
    await tree.file('src/2025-05-10_10-00-00_A.DNG')
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    const result = await scanSource(tree.path('src'))
    const raws = result.files.filter((f) => f.isRaw).map((f) => f.ext)
    expect(raws.sort()).toEqual(['dng', 'nef'])
  })

  test('carries the parsed year and month', async () => {
    await tree.file('src/2024-12-31_23-59-59_A.JPG')
    const result = await scanSource(tree.path('src'))
    expect(result.files[0]!.parsed).toMatchObject({year: '2024', month: '12'})
  })

  test('skips hidden files', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await tree.file('src/.DS_Store')
    const result = await scanSource(tree.path('src'))
    expect(result.files).toHaveLength(1)
    expect(result.rejected).toEqual([])
  })

  test('an empty source yields nothing', async () => {
    await tree.dir('src')
    const result = await scanSource(tree.path('src'))
    expect(result).toEqual({files: [], rejected: []})
  })
})
