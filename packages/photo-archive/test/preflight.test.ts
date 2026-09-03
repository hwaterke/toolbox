import {afterEach, beforeEach, describe, expect, test} from 'vitest'
import {classifyFootage, preflight} from '../src/lib/preflight.ts'
import {makeTempTree, type TempTree} from './utils/tempArchive.ts'

let tree: TempTree

beforeEach(async () => {
  tree = await makeTempTree()
})

afterEach(async () => {
  await tree.cleanup()
})

/** A minimal valid archive plus an outside source folder. */
async function archive(): Promise<{root: string; source: string}> {
  await tree.dir('archive/sorted')
  await tree.dir('archive/events')
  await tree.dir('incoming')
  return {root: tree.path('archive'), source: tree.path('incoming')}
}

const run = (overrides: Partial<Parameters<typeof preflight>[0]> = {}) =>
  preflight({
    source: tree.path('incoming'),
    archiveRoot: tree.path('archive'),
    createEvent: false,
    ...overrides,
  })

describe('archive root shape (decision 17)', () => {
  test('accepts a root holding sorted/', async () => {
    await tree.dir('archive/sorted')
    await tree.dir('incoming')
    expect((await run()).ok).toBe(true)
  })

  test('refuses a root holding neither events/ nor sorted/', async () => {
    await tree.dir('archive')
    await tree.dir('incoming')
    const result = await run()
    expect(result).toMatchObject({ok: false})
    expect(result.ok === false && result.error).toMatch(/neither events/)
  })

  test('refuses a root that does not exist', async () => {
    await tree.dir('incoming')
    const result = await run()
    expect(result.ok).toBe(false)
  })

  test('refuses a source that does not exist', async () => {
    await tree.dir('archive/sorted')
    const result = await run()
    expect(result.ok === false && result.error).toMatch(/Source is not a dir/)
  })
})

describe('source location (decision 28)', () => {
  test('accepts a source outside the archive', async () => {
    await archive()
    expect((await run()).ok).toBe(true)
  })

  test('accepts a to-sort folder inside the archive', async () => {
    const {root} = await archive()
    await tree.dir('archive/to-sort')
    expect((await run({source: `${root}/to-sort`})).ok).toBe(true)
  })

  test('refuses the archive root itself', async () => {
    const {root} = await archive()
    const result = await run({source: root})
    expect(result.ok === false && result.error).toMatch(/archive root itself/)
  })

  test('refuses a source inside events/ or sorted/', async () => {
    const {root} = await archive()
    await tree.dir('archive/events/2025-05-10-Iceland')
    await tree.dir('archive/sorted/2025/05')
    const inEvents = await run({source: `${root}/events/2025-05-10-Iceland`})
    const inSorted = await run({source: `${root}/sorted/2025/05`})
    expect(inEvents.ok === false && inEvents.error).toMatch(/inside events/)
    expect(inSorted.ok === false && inSorted.error).toMatch(/inside sorted/)
  })

  test('refuses a source inside a raw_versions folder', async () => {
    const {root} = await archive()
    await tree.dir('archive/to-sort/raw_versions')
    const result = await run({source: `${root}/to-sort/raw_versions`})
    expect(result.ok === false && result.error).toMatch(/raw_versions/)
  })
})

describe('--source segment (trap T5)', () => {
  test('requires --event', async () => {
    await archive()
    const result = await run({sourceName: 'dji'})
    expect(result.ok === false && result.error).toMatch(/requires --event/)
  })

  test('refuses a path instead of a segment', async () => {
    await archive()
    await tree.dir('archive/events/2025-05-10-Iceland/footage')
    const result = await run({
      event: '2025-05-10-Iceland',
      sourceName: '../escape',
    })
    expect(result.ok === false && result.error).toMatch(/single folder name/)
  })
})

describe('the event folder (decision 15)', () => {
  test('accepts an existing event', async () => {
    await archive()
    await tree.dir('archive/events/2025-05-10-Iceland/footage')
    expect((await run({event: '2025-05-10-Iceland'})).ok).toBe(true)
  })

  test('refuses a name that is not YYYY-MM-DD-Name', async () => {
    await archive()
    const result = await run({event: 'Iceland'})
    expect(result.ok === false && result.error).toMatch(/YYYY-MM-DD-Name/)
  })

  test('refuses a missing event and suggests the near match', async () => {
    await archive()
    await tree.dir('archive/events/2025-05-10-Iceland')
    const result = await run({event: '2025-05-10-Icelnd'})
    expect(result.ok === false && result.error).toMatch(
      /Did you mean "2025-05-10-Iceland"/
    )
  })

  test('offers --create-event when nothing is close', async () => {
    await archive()
    await tree.dir('archive/events/2019-01-01-Something-Totally-Else')
    const result = await run({event: '2025-05-10-Iceland'})
    expect(result.ok === false && result.error).toMatch(/--create-event/)
    expect(result.ok === false && result.error).not.toMatch(/Did you mean/)
  })

  test('--create-event accepts a missing event and reports it for creation', async () => {
    await archive()
    const result = await run({event: '2025-05-10-Iceland', createEvent: true})
    expect(result).toMatchObject({
      ok: true,
      event: '2025-05-10-Iceland',
      eventToCreate: '2025-05-10-Iceland',
    })
  })

  test('--create-event without --event is refused', async () => {
    await archive()
    const result = await run({createEvent: true})
    expect(result.ok === false && result.error).toMatch(/requires --event/)
  })
})

describe('footage layout clash (decision 16)', () => {
  test('flat footage plus --source is refused', async () => {
    await archive()
    await tree.file(
      'archive/events/2025-05-10-Iceland/footage/2025-05-10_10-00-00_A.JPG'
    )
    const result = await run({
      event: '2025-05-10-Iceland',
      sourceName: 'dji',
    })
    expect(result.ok === false && result.error).toMatch(/flat layout/)
  })

  test('grouped footage without --source is refused', async () => {
    await archive()
    await tree.dir('archive/events/2025-05-10-Iceland/footage/dji')
    const result = await run({event: '2025-05-10-Iceland'})
    expect(result.ok === false && result.error).toMatch(/grouped layout/)
  })

  test('an empty footage folder accepts either mode', async () => {
    await archive()
    await tree.dir('archive/events/2025-05-10-Iceland/footage')
    expect((await run({event: '2025-05-10-Iceland'})).ok).toBe(true)
    expect(
      (await run({event: '2025-05-10-Iceland', sourceName: 'dji'})).ok
    ).toBe(true)
  })

  test('a raw_versions folder alone does not count as grouped', async () => {
    await archive()
    await tree.dir('archive/events/2025-05-10-Iceland/footage/raw_versions')
    expect((await run({event: '2025-05-10-Iceland'})).ok).toBe(true)
  })

  test('already-mixed footage is refused in both modes', async () => {
    await archive()
    await tree.dir('archive/events/2025-05-10-Iceland/footage/dji')
    await tree.file(
      'archive/events/2025-05-10-Iceland/footage/2025-05-10_10-00-00_A.JPG'
    )
    const plain = await run({event: '2025-05-10-Iceland'})
    const grouped = await run({event: '2025-05-10-Iceland', sourceName: 'dji'})
    expect(plain.ok === false && plain.error).toMatch(/mixes/)
    expect(grouped.ok === false && grouped.error).toMatch(/mixes/)
  })
})

describe('classifyFootage', () => {
  const entry = (name: string, isDirectory = false) => ({name, isDirectory})

  test('an empty listing is empty', () => {
    expect(classifyFootage([])).toBe('empty')
  })

  test('loose media is flat', () => {
    expect(classifyFootage([entry('a.JPG')])).toBe('flat')
  })

  test('a sub-folder is grouped', () => {
    expect(classifyFootage([entry('dji', true)])).toBe('grouped')
  })

  test('raw_versions is not a grouping sub-folder', () => {
    expect(classifyFootage([entry('raw_versions', true)])).toBe('empty')
  })

  test('panorama is not a grouping sub-folder', () => {
    expect(classifyFootage([entry('panorama', true)])).toBe('empty')
  })

  test('a source folder merely containing panorama still groups (T4)', () => {
    expect(classifyFootage([entry('dji-panorama', true)])).toBe('grouped')
    expect(classifyFootage([entry('dji-PANORAMA', true)])).toBe('grouped')
    expect(classifyFootage([entry('PANORAMA', true)])).toBe('grouped')
  })

  test('a non-media file does not make it flat', () => {
    expect(classifyFootage([entry('notes.txt'), entry('.DS_Store')])).toBe(
      'empty'
    )
  })

  test('both together is mixed', () => {
    expect(classifyFootage([entry('a.JPG'), entry('dji', true)])).toBe('mixed')
  })
})
