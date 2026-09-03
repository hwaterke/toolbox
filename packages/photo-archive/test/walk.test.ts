import {afterEach, beforeEach, describe, expect, test} from 'vitest'
import {scopeLabel, scopeTree, type Scope} from '../src/lib/model.ts'
import {walkArchive, type WalkProgress} from '../src/lib/walk.ts'
import {makeTempTree, type TempTree} from './utils/tempArchive.ts'

let tree: TempTree

beforeEach(async () => {
  tree = await makeTempTree()
})

afterEach(async () => {
  await tree.cleanup()
})

/** An archive holding one of every scope kind, plus the awkward cases. */
const seedArchive = async (): Promise<void> => {
  await tree.file('fs-ignore', '.DS_Store\n@eaDir/\n')

  // An event with a grouped footage/ and a panorama set inside the bucket.
  const iceland = 'events/2025-05-10-Iceland/footage'
  await tree.file(`${iceland}/dji/2025-05-10_10-00-00_A.JPG`)
  await tree.file(`${iceland}/dji/2025-05-10_10-00-01_B.JPG`)
  await tree.file(`${iceland}/raw_versions/dji/2025-05-10_10-00-00_A.DNG`)
  await tree.file(`${iceland}/raw_versions/panorama/100_0019/DJI_0004.DNG`)
  await tree.file(`${iceland}/raw_versions/panorama/100_0019/DJI_0005.DNG`)
  await tree.file(`${iceland}/.DS_Store`)
  await tree.file('events/2025-05-10-Iceland/README.md')

  // An event with no footage/ at all.
  await tree.dir('events/2025-06-01-NoFootage')

  // sorted/, one year, one month.
  await tree.file('sorted/2025/05/2025-05-10_10-00-00_A.JPG')
  await tree.file('sorted/2025/05/raw_versions/2025-05-10_10-00-00_A.DNG')

  // A person folder, recursing with the same rule as the root.
  await tree.file(
    'relations/sarah/events/2024-01-01-Trip/footage/2024-01-01_09-00-00_A.JPG'
  )
  await tree.file('relations/sarah/sorted/2024/01/2024-01-01_09-00-00_B.JPG')

  // Skipped top-level entries, and one the ignore file covers.
  await tree.dir('to-sort')
  await tree.file('@eaDir/thumb.JPG')
}

const collect = async (options?: {only?: string[]}): Promise<Scope[]> => {
  const scopes: Scope[] = []
  for await (const scope of walkArchive({
    archiveRoot: tree.root,
    ...(options?.only ? {only: options.only} : {}),
  })) {
    scopes.push(scope)
  }
  return scopes
}

describe('walkArchive', () => {
  test('yields every scope kind, each exactly once', async () => {
    await seedArchive()
    const scopes = await collect()

    expect(scopes.map((s) => `${s.kind}:${scopeLabel(s)}`)).toEqual([
      'root:archive root',
      'event:2025-05-10-Iceland',
      'event:2025-06-01-NoFootage',
      'sorted:sorted',
      'sorted:sorted/2025',
      'month:sorted/2025/05',
      'person:relations/sarah',
      'event:2024-01-01-Trip',
      'sorted:sorted',
      'sorted:sorted/2024',
      'month:sorted/2024/01',
    ])
  })

  test('the root scope lists only what is not ignored', async () => {
    await seedArchive()
    const [root] = await collect()

    // `@eaDir` comes from the archive's own fs-ignore, `fs-ignore` is reserved.
    expect(root?.kind).toBe('root')
    expect(root?.kind === 'root' && root.entries.map((e) => e.name)).toEqual([
      'events',
      'relations',
      'sorted',
      'to-sort',
    ])
  })

  test('an event carries its footage tree and nothing else', async () => {
    await seedArchive()
    const scopes = await collect()
    const iceland = scopes.find(
      (s) => s.kind === 'event' && s.name === '2025-05-10-Iceland'
    )

    expect(iceland?.kind).toBe('event')
    if (iceland?.kind !== 'event') return

    expect(iceland.entries.map((e) => e.name)).toEqual(['README.md', 'footage'])
    expect(iceland.person).toBeNull()
    expect(iceland.footage?.files.map((f) => f.relativePath)).toEqual([
      'dji/2025-05-10_10-00-00_A.JPG',
      'dji/2025-05-10_10-00-01_B.JPG',
      'raw_versions/dji/2025-05-10_10-00-00_A.DNG',
    ])
    expect(iceland.footage?.files.map((f) => f.folder)).toEqual([
      'dji',
      'dji',
      'raw_versions/dji',
    ])
  })

  test('a panorama folder is listed but never descended into (T3)', async () => {
    await seedArchive()
    const scopes = await collect()
    const iceland = scopes.find(
      (s) => s.kind === 'event' && s.name === '2025-05-10-Iceland'
    )
    const footage = iceland === undefined ? null : scopeTree(iceland)

    expect(footage?.folders.map((f) => f.relativePath)).toEqual([
      'dji',
      'raw_versions',
      'raw_versions/dji',
      'raw_versions/panorama',
    ])
    expect(footage?.folders.filter((f) => f.isPanorama)).toHaveLength(1)
    // The set below it, and its files, are not in the scope at all.
    expect(
      footage?.files.some((f) => f.relativePath.includes('panorama'))
    ).toBe(false)
  })

  test('a source folder merely containing the word is descended into (T4)', async () => {
    await tree.file('events/2025-05-10-A/footage/dji-panorama/set/a.JPG')
    const scopes = await collect()
    const footage = scopeTree(scopes[1]!)

    expect(footage?.files.map((f) => f.relativePath)).toEqual([
      'dji-panorama/set/a.JPG',
    ])
    expect(footage?.folders.every((f) => !f.isPanorama)).toBe(true)
  })

  test('an event with no footage carries a null tree', async () => {
    await seedArchive()
    const scopes = await collect()
    const bare = scopes.find(
      (s) => s.kind === 'event' && s.name === '2025-06-01-NoFootage'
    )

    expect(bare?.kind === 'event' && bare.footage).toBeNull()
  })

  test('scopes inside a person folder know whose they are', async () => {
    await seedArchive()
    const scopes = await collect()
    const trip = scopes.find(
      (s) => s.kind === 'event' && s.name === '2024-01-01-Trip'
    )
    const month = scopes.find((s) => s.kind === 'month' && s.year === '2024')

    expect(trip?.kind === 'event' && trip.person).toBe('sarah')
    expect(month?.kind === 'month' && month.person).toBe('sarah')
  })

  test('a month carries its own files, bucket included', async () => {
    await seedArchive()
    const scopes = await collect()
    const may = scopes.find(
      (s) => s.kind === 'month' && s.year === '2025' && s.month === '05'
    )

    expect(
      may === undefined
        ? null
        : scopeTree(may)?.files.map((f) => f.relativePath)
    ).toEqual([
      '2025-05-10_10-00-00_A.JPG',
      'raw_versions/2025-05-10_10-00-00_A.DNG',
    ])
  })

  test('--only reads through the folders on the way to its target', async () => {
    await seedArchive()
    const scopes = await collect({only: [tree.path('sorted/2025/05')]})

    expect(scopes.map(scopeLabel)).toEqual(['sorted/2025/05'])
  })

  test('--only on one event skips every other scope', async () => {
    await seedArchive()
    const scopes = await collect({
      only: [tree.path('events/2025-05-10-Iceland')],
    })

    expect(scopes.map(scopeLabel)).toEqual(['2025-05-10-Iceland'])
  })

  test('progress reports each scope once, with its file count', async () => {
    await seedArchive()
    const seen: WalkProgress[] = []
    for await (const _scope of walkArchive({
      archiveRoot: tree.root,
      onProgress: (progress) => seen.push(progress),
    })) {
      // drained
    }

    expect(seen.map((p) => p.scopeIndex)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ])
    expect(seen.find((p) => p.scope.kind === 'event')?.files).toBe(3)
    expect(seen.find((p) => p.scope.kind === 'month')?.files).toBe(2)
  })

  test('an archive with nothing in it yields just the root', async () => {
    const scopes = await collect()
    expect(scopes.map((s) => s.kind)).toEqual(['root'])
  })
})
