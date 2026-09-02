import {promises as fs} from 'node:fs'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'
import {ingest} from '../src/lib/ingest.ts'
import {Manifest} from '../src/lib/manifest.ts'
import {formatUndoReport, undo, undoExitCode} from '../src/lib/undo.ts'
import {makeTempTree, type TempTree} from './utils/tempArchive.ts'

let tree: TempTree

beforeEach(async () => {
  tree = await makeTempTree()
  await tree.dir('archive/sorted')
  await tree.dir('archive/events')
  await tree.dir('src')
})

afterEach(async () => {
  await tree.cleanup()
})

const manifestFile = () => tree.path('logs/run.jsonl')

/** Run a real ingest and return its manifest path. */
async function ingestAll(
  overrides: Partial<Parameters<typeof ingest>[0]> = {}
): Promise<void> {
  const manifest = new Manifest(manifestFile())
  await ingest({
    source: tree.path('src'),
    archiveRoot: tree.path('archive'),
    createEvent: false,
    execute: true,
    manifest,
    ...overrides,
  })
  await manifest.close()
}

describe('round trip (step 5.2)', () => {
  test('ingest then undo restores the source byte for byte', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG', 'jpg-bytes')
    await tree.file('src/2025-05-10_10-00-00_A.NEF', 'nef-bytes')
    await tree.file('src/deep/2024-12-31_23-59-59_B.MP4', 'mp4-bytes')

    const before = await tree.list('src')
    const contentsBefore = new Map<string, string>()
    for (const relative of before) {
      contentsBefore.set(relative, await tree.read(`src/${relative}`))
    }

    await ingestAll()
    expect(await tree.list('src')).toEqual([])
    expect(await tree.list('archive')).toHaveLength(3)

    const report = await undo({manifestPath: manifestFile(), execute: true})

    expect(report.restored).toHaveLength(3)
    expect(report.skipped).toEqual([])
    expect(undoExitCode(report)).toBe(0)

    // The source tree is byte-identical to what it was.
    expect(await tree.list('src')).toEqual(before)
    for (const [relative, expected] of contentsBefore) {
      expect(await tree.read(`src/${relative}`)).toBe(expected)
    }

    // No archived files are left.
    expect(await tree.list('archive')).toEqual([])
  })

  test('the sub-folder a file came from is restored, not flattened', async () => {
    await tree.file('src/card/DCIM/2025-05-10_10-00-00_A.JPG')
    await ingestAll()
    await undo({manifestPath: manifestFile(), execute: true})
    expect(await tree.list('src')).toEqual([
      'card/DCIM/2025-05-10_10-00-00_A.JPG',
    ])
  })

  test('a paired RAW comes back out of raw_versions', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await tree.file('src/2025-05-10_10-00-00_A.NEF')
    await ingestAll()
    expect(await tree.list('archive')).toContain(
      'sorted/2025/05/raw_versions/2025-05-10_10-00-00_A.NEF'
    )
    await undo({manifestPath: manifestFile(), execute: true})
    expect(await tree.list('src')).toEqual([
      '2025-05-10_10-00-00_A.JPG',
      '2025-05-10_10-00-00_A.NEF',
    ])
  })

  test('an event run is reversed too', async () => {
    await tree.dir('archive/events/2025-05-10-Iceland/footage')
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await ingestAll({event: '2025-05-10-Iceland'})
    await undo({manifestPath: manifestFile(), execute: true})
    expect(await tree.list('src')).toEqual(['2025-05-10_10-00-00_A.JPG'])
    expect(await tree.list('archive')).toEqual([])
  })
})

describe('undo dry run', () => {
  test('reports the moves and touches nothing', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await ingestAll()
    const before = await tree.list()

    const report = await undo({manifestPath: manifestFile(), execute: false})

    expect(report.dryRun).toBe(true)
    expect(report.restored).toHaveLength(1)
    expect(await tree.list()).toEqual(before)
  })

  test('it reports exactly what the real undo then does', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await tree.file('src/2025-05-10_10-00-00_A.NEF')
    await ingestAll()

    const planned = await undo({manifestPath: manifestFile(), execute: false})
    const actual = await undo({manifestPath: manifestFile(), execute: true})

    expect(planned.restored.map((r) => r.to).sort()).toEqual(
      actual.restored.map((r) => r.to).sort()
    )
  })
})

describe('undo refuses to overwrite', () => {
  test('an occupied original path is skipped, both copies kept', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG', 'moved-away')
    await ingestAll()
    // Something new appears at the original path before the undo.
    await tree.file('src/2025-05-10_10-00-00_A.JPG', 'new-file')

    const report = await undo({manifestPath: manifestFile(), execute: true})

    expect(report.restored).toEqual([])
    expect(report.skipped).toMatchObject([{reason: 'original_path_taken'}])
    expect(undoExitCode(report)).toBe(1)
    expect(await tree.read('src/2025-05-10_10-00-00_A.JPG')).toBe('new-file')
    expect(
      await tree.read('archive/sorted/2025/05/2025-05-10_10-00-00_A.JPG')
    ).toBe('moved-away')
  })

  test('a file no longer at the archived path is reported', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await ingestAll()
    await fs.rm(tree.path('archive/sorted/2025/05/2025-05-10_10-00-00_A.JPG'))

    const report = await undo({manifestPath: manifestFile(), execute: true})

    expect(report.skipped).toMatchObject([{reason: 'archived_file_missing'}])
    expect(undoExitCode(report)).toBe(1)
  })

  test('the rest is still restored when one entry fails', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await tree.file('src/2025-05-10_10-00-01_B.JPG')
    await ingestAll()
    await fs.rm(tree.path('archive/sorted/2025/05/2025-05-10_10-00-00_A.JPG'))

    const report = await undo({manifestPath: manifestFile(), execute: true})

    expect(report.restored).toHaveLength(1)
    expect(report.skipped).toHaveLength(1)
    expect(await tree.list('src')).toEqual(['2025-05-10_10-00-01_B.JPG'])
  })
})

describe('undo bookkeeping', () => {
  test('works through the manifest in reverse order', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await tree.file('src/2025-05-10_10-00-01_B.JPG')
    await tree.file('src/2025-05-10_10-00-02_C.JPG')
    await ingestAll()

    const report = await undo({manifestPath: manifestFile(), execute: true})
    const names = report.restored.map((r) => r.to.split('/').pop())
    expect(names).toEqual([
      '2025-05-10_10-00-02_C.JPG',
      '2025-05-10_10-00-01_B.JPG',
      '2025-05-10_10-00-00_A.JPG',
    ])
  })

  test('an empty manifest file restores nothing', async () => {
    await tree.file('logs/empty.jsonl', '')
    const report = await undo({
      manifestPath: tree.path('logs/empty.jsonl'),
      execute: true,
    })
    expect(report).toMatchObject({restored: [], skipped: [], total: 0})
    expect(undoExitCode(report)).toBe(0)
  })

  test('a missing manifest file is an error, not a silent no-op', async () => {
    await expect(
      undo({manifestPath: tree.path('logs/nope.jsonl'), execute: true})
    ).rejects.toThrow()
  })

  test('undoing twice is safe — the second run restores nothing', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await ingestAll()
    await undo({manifestPath: manifestFile(), execute: true})

    const second = await undo({manifestPath: manifestFile(), execute: true})
    expect(second.restored).toEqual([])
    expect(second.skipped).toMatchObject([{reason: 'archived_file_missing'}])
    expect(await tree.list('src')).toEqual(['2025-05-10_10-00-00_A.JPG'])
  })
})

describe('formatUndoReport', () => {
  test('names the counts and the dry run', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await ingestAll()
    const lines = formatUndoReport(
      await undo({manifestPath: manifestFile(), execute: false})
    ).join('\n')
    expect(lines).toMatch(/1 of 1 file\(s\) would move back/)
    expect(lines).toMatch(/Dry run/)
  })

  test('groups what could not be restored', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await ingestAll()
    await fs.rm(tree.path('archive/sorted/2025/05/2025-05-10_10-00-00_A.JPG'))
    const lines = formatUndoReport(
      await undo({manifestPath: manifestFile(), execute: true})
    ).join('\n')
    expect(lines).toMatch(/1 file\(s\) not restored:/)
    expect(lines).toMatch(/not where the manifest says \(1\)/)
  })
})
