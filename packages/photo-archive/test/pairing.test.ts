import {afterEach, beforeEach, describe, expect, test} from 'vitest'
import {DirectoryCache, goesToBucket, resolvePairs} from '../src/lib/pairing.ts'
import {scanSource} from '../src/lib/scan.ts'
import {makeTempTree, type TempTree} from './utils/tempArchive.ts'

let tree: TempTree

beforeEach(async () => {
  tree = await makeTempTree()
})

afterEach(async () => {
  await tree.cleanup()
})

async function pairsFor(
  options: {event?: string; source?: string} = {}
): Promise<Map<string, ReturnType<typeof String>>> {
  const {files} = await scanSource(tree.path('src'))
  const outcomes = await resolvePairs({
    files,
    archiveRoot: tree.path('archive'),
    event: options.event,
    source: options.source,
  })
  // Re-key by filename so assertions stay readable.
  const byName = new Map<string, string>()
  for (const file of files) {
    const outcome = outcomes.get(file.path)!
    byName.set(
      file.name,
      outcome.kind === 'paired' ? `paired:${outcome.method}` : outcome.kind
    )
  }
  return byName
}

describe('pairing within the batch', () => {
  test('a RAW with an exact-stem JPG in the batch is paired', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.NEF')
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    const pairs = await pairsFor()
    expect(pairs.get('2025-05-10_10-00-00_A.NEF')).toBe('paired:exact')
    expect(pairs.get('2025-05-10_10-00-00_A.JPG')).toBe('not_raw')
  })

  test('the drone one-second offset pairs on the token', async () => {
    await tree.file('src/2025-05-10_15-08-02_DJI_0173.DNG')
    await tree.file('src/2025-05-10_15-08-01_DJI_0173.JPG')
    expect((await pairsFor()).get('2025-05-10_15-08-02_DJI_0173.DNG')).toBe(
      'paired:pass2'
    )
  })

  test('a lone RAW is unpaired', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.NEF')
    expect((await pairsFor()).get('2025-05-10_10-00-00_A.NEF')).toBe('unpaired')
  })

  test('two candidates in the window are ambiguous, never guessed', async () => {
    await tree.file('src/2025-01-01_10-00-01_T.NEF')
    await tree.file('src/2025-01-01_10-00-00_T.JPG')
    await tree.file('src/2025-01-01_10-00-02_T.JPG')
    expect((await pairsFor()).get('2025-01-01_10-00-01_T.NEF')).toBe(
      'ambiguous'
    )
  })

  test('the twin may live in a different sub-folder — the batch is flat', async () => {
    await tree.file('src/raw/2025-05-10_10-00-00_A.NEF')
    await tree.file('src/jpg/2025-05-10_10-00-00_A.JPG')
    expect((await pairsFor()).get('2025-05-10_10-00-00_A.NEF')).toBe(
      'paired:exact'
    )
  })
})

describe('pairing against the destination (decision 5)', () => {
  test('a RAW pairs with a JPG filed on an earlier run', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.NEF')
    await tree.file('archive/sorted/2025/05/2025-05-10_10-00-00_A.JPG')
    expect((await pairsFor()).get('2025-05-10_10-00-00_A.NEF')).toBe(
      'paired:exact'
    )
  })

  test('a JPG in the wrong month folder does not pair', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.NEF')
    await tree.file('archive/sorted/2025/06/2025-05-10_10-00-00_A.JPG')
    expect((await pairsFor()).get('2025-05-10_10-00-00_A.NEF')).toBe('unpaired')
  })

  test('event mode looks in events/N/footage', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.NEF')
    await tree.file(
      'archive/events/2025-05-10-Iceland/footage/2025-05-10_10-00-00_A.JPG'
    )
    const pairs = await pairsFor({event: '2025-05-10-Iceland'})
    expect(pairs.get('2025-05-10_10-00-00_A.NEF')).toBe('paired:exact')
  })

  test('--source mode looks in events/N/footage/S', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.NEF')
    await tree.file(
      'archive/events/2025-05-10-Iceland/footage/dji/2025-05-10_10-00-00_A.JPG'
    )
    const pairs = await pairsFor({event: '2025-05-10-Iceland', source: 'dji'})
    expect(pairs.get('2025-05-10_10-00-00_A.NEF')).toBe('paired:exact')
  })

  test('a JPG already in the bucket is not treated as the twin', async () => {
    // Only the normal folder is searched; the bucket holds RAWs.
    await tree.file('src/2025-05-10_10-00-00_A.NEF')
    await tree.file(
      'archive/sorted/2025/05/raw_versions/2025-05-10_10-00-00_A.JPG'
    )
    expect((await pairsFor()).get('2025-05-10_10-00-00_A.NEF')).toBe('unpaired')
  })

  test('a missing destination folder is simply empty', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.NEF')
    await tree.dir('archive')
    expect((await pairsFor()).get('2025-05-10_10-00-00_A.NEF')).toBe('unpaired')
  })
})

describe('DirectoryCache (trap T6)', () => {
  test('reads each directory once, however many RAWs ask for it', async () => {
    const calls: string[] = []
    const cache = new DirectoryCache(async (directory) => {
      calls.push(directory)
      return []
    })
    for (const index of [0, 1, 2, 3, 4]) {
      await tree.file(`src/2025-05-10_10-00-0${index}_A${index}.NEF`)
    }
    const {files} = await scanSource(tree.path('src'))
    await resolvePairs({files, archiveRoot: tree.path('archive'), cache})
    expect(files).toHaveLength(5)
    expect(calls).toHaveLength(1)
    expect(cache.size).toBe(1)
  })

  test('different months are listed separately', async () => {
    const calls: string[] = []
    const cache = new DirectoryCache(async (directory) => {
      calls.push(directory)
      return []
    })
    await tree.file('src/2025-05-10_10-00-00_A.NEF')
    await tree.file('src/2025-06-10_10-00-00_B.NEF')
    const {files} = await scanSource(tree.path('src'))
    await resolvePairs({files, archiveRoot: tree.path('archive'), cache})
    expect(calls).toHaveLength(2)
  })

  test('a non-RAW never triggers a listing', async () => {
    const calls: string[] = []
    const cache = new DirectoryCache(async (directory) => {
      calls.push(directory)
      return []
    })
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    const {files} = await scanSource(tree.path('src'))
    await resolvePairs({files, archiveRoot: tree.path('archive'), cache})
    expect(calls).toEqual([])
  })
})

describe('goesToBucket', () => {
  test('only a confident pair is bucketed', () => {
    expect(
      goesToBucket({kind: 'paired', method: 'exact', photo: 'a.jpg'})
    ).toBe(true)
    expect(goesToBucket({kind: 'unpaired'})).toBe(false)
    expect(goesToBucket({kind: 'ambiguous', candidates: ['a', 'b']})).toBe(
      false
    )
    expect(goesToBucket({kind: 'not_raw'})).toBe(false)
  })
})
