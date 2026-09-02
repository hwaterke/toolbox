import {afterEach, beforeEach, describe, expect, test} from 'vitest'
import {ingest, PreflightError, type IngestOptions} from '../src/lib/ingest.ts'
import {Manifest, readManifest} from '../src/lib/manifest.ts'
import {colorize, exitCode, formatReport} from '../src/lib/report.ts'
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

const run = (overrides: Partial<IngestOptions> = {}) =>
  ingest({
    source: tree.path('src'),
    archiveRoot: tree.path('archive'),
    createEvent: false,
    execute: true,
    ...overrides,
  })

const archiveFiles = () => tree.list('archive')
const sourceFiles = () => tree.list('src')

describe('sorted mode', () => {
  test('files land in sorted/YYYY/MM', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await tree.file('src/2024-12-31_23-59-59_B.MP4')
    const report = await run()
    expect(report.moved).toHaveLength(2)
    expect(await archiveFiles()).toEqual([
      'sorted/2024/12/2024-12-31_23-59-59_B.MP4',
      'sorted/2025/05/2025-05-10_10-00-00_A.JPG',
    ])
    expect(await sourceFiles()).toEqual([])
    expect(exitCode(report)).toBe(0)
  })

  test('the tree is flattened — sub-folders are ignored', async () => {
    await tree.file('src/card/DCIM/100/2025-05-10_10-00-00_A.JPG')
    await run()
    expect(await archiveFiles()).toEqual([
      'sorted/2025/05/2025-05-10_10-00-00_A.JPG',
    ])
  })

  test('a paired RAW goes to raw_versions, its JPG does not', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await tree.file('src/2025-05-10_10-00-00_A.NEF')
    await run()
    expect(await archiveFiles()).toEqual([
      'sorted/2025/05/2025-05-10_10-00-00_A.JPG',
      'sorted/2025/05/raw_versions/2025-05-10_10-00-00_A.NEF',
    ])
  })

  test('a lone RAW stays in the normal folder so Immich indexes it', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.NEF')
    await run()
    expect(await archiveFiles()).toEqual([
      'sorted/2025/05/2025-05-10_10-00-00_A.NEF',
    ])
  })

  test('a RAW pairs with a JPG filed on an earlier run', async () => {
    await tree.file('archive/sorted/2025/05/2025-05-10_10-00-00_A.JPG')
    await tree.file('src/2025-05-10_10-00-00_A.NEF')
    await run()
    expect(await archiveFiles()).toContain(
      'sorted/2025/05/raw_versions/2025-05-10_10-00-00_A.NEF'
    )
  })

  test('file contents survive the move', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG', 'the-bytes')
    await run()
    expect(
      await tree.read('archive/sorted/2025/05/2025-05-10_10-00-00_A.JPG')
    ).toBe('the-bytes')
  })
})

describe('event mode', () => {
  const event = '2025-05-10-Iceland'

  test('files land in events/N/footage', async () => {
    await tree.dir(`archive/events/${event}/footage`)
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await run({event})
    expect(await archiveFiles()).toEqual([
      `events/${event}/footage/2025-05-10_10-00-00_A.JPG`,
    ])
  })

  test('a paired RAW goes to footage/raw_versions', async () => {
    await tree.dir(`archive/events/${event}/footage`)
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await tree.file('src/2025-05-10_10-00-00_A.NEF')
    await run({event})
    expect(await archiveFiles()).toContain(
      `events/${event}/footage/raw_versions/2025-05-10_10-00-00_A.NEF`
    )
  })

  test('--create-event makes the folder and files into it', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await run({event, createEvent: true})
    expect(await archiveFiles()).toEqual([
      `events/${event}/footage/2025-05-10_10-00-00_A.JPG`,
    ])
  })

  test('a file with a different date still lands in the event', async () => {
    await tree.dir(`archive/events/${event}/footage`)
    await tree.file('src/1999-01-01_00-00-00_OLD.JPG')
    await run({event})
    expect(await archiveFiles()).toEqual([
      `events/${event}/footage/1999-01-01_00-00-00_OLD.JPG`,
    ])
  })
})

describe('--source mode', () => {
  const event = '2025-05-10-Iceland'

  test('files land in events/N/footage/S', async () => {
    await tree.dir(`archive/events/${event}/footage/dji`)
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await run({event, sourceName: 'dji'})
    expect(await archiveFiles()).toEqual([
      `events/${event}/footage/dji/2025-05-10_10-00-00_A.JPG`,
    ])
  })

  test('a paired RAW goes to footage/raw_versions/S', async () => {
    await tree.dir(`archive/events/${event}/footage/dji`)
    await tree.file('src/2025-05-10_15-08-01_DJI_0173.JPG')
    await tree.file('src/2025-05-10_15-08-02_DJI_0173.DNG')
    await run({event, sourceName: 'dji'})
    expect(await archiveFiles()).toEqual([
      `events/${event}/footage/dji/2025-05-10_15-08-01_DJI_0173.JPG`,
      `events/${event}/footage/raw_versions/dji/2025-05-10_15-08-02_DJI_0173.DNG`,
    ])
  })
})

describe('files left behind (decision 18)', () => {
  test('an unknown type is reported and stays put', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await tree.file('src/2025-05-10_10-00-00_A.AAE')
    const report = await run()
    expect(report.leftBehind).toMatchObject([{reason: 'unknown_type'}])
    expect(await sourceFiles()).toEqual(['2025-05-10_10-00-00_A.AAE'])
    expect(exitCode(report)).toBe(1)
  })

  test('a file with no date prefix stays put', async () => {
    await tree.file('src/DSC_0001.NEF')
    const report = await run()
    expect(report.leftBehind).toMatchObject([{reason: 'no_date_prefix'}])
    expect(await sourceFiles()).toEqual(['DSC_0001.NEF'])
    expect(exitCode(report)).toBe(1)
  })

  test('the rest of the batch still moves', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await tree.file('src/DSC_0001.NEF')
    const report = await run()
    expect(report.moved).toHaveLength(1)
    expect(report.leftBehind).toHaveLength(1)
  })

  test('a collision is skipped, leaving the source untouched', async () => {
    await tree.file(
      'archive/sorted/2025/05/2025-05-10_10-00-00_A.JPG',
      'original'
    )
    await tree.file('src/2025-05-10_10-00-00_A.JPG', 'incoming')
    const report = await run()
    expect(report.leftBehind).toMatchObject([{reason: 'destination_exists'}])
    expect(await sourceFiles()).toEqual(['2025-05-10_10-00-00_A.JPG'])
    expect(
      await tree.read('archive/sorted/2025/05/2025-05-10_10-00-00_A.JPG')
    ).toBe('original')
  })

  test('two batch files landing on one name: first moves, second skips', async () => {
    await tree.file('src/a/2025-05-10_10-00-00_A.JPG', 'first')
    await tree.file('src/b/2025-05-10_10-00-00_A.JPG', 'second')
    const report = await run()
    expect(report.moved).toHaveLength(1)
    expect(report.leftBehind).toMatchObject([{reason: 'destination_exists'}])
    expect(await sourceFiles()).toHaveLength(1)
  })

  test('an ambiguous RAW is left behind, never guessed into the bucket', async () => {
    await tree.file('src/2025-01-01_10-00-01_T.NEF')
    await tree.file('src/2025-01-01_10-00-00_T.JPG')
    await tree.file('src/2025-01-01_10-00-02_T.JPG')
    const report = await run()
    expect(report.leftBehind).toMatchObject([{reason: 'ambiguous_pair'}])
    expect(await sourceFiles()).toEqual(['2025-01-01_10-00-01_T.NEF'])
    expect((await archiveFiles()).some((f) => f.includes('raw_versions'))).toBe(
      false
    )
  })

  test('a fully drained source exits 0', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    expect(exitCode(await run())).toBe(0)
  })
})

describe('dry run is the default behaviour (decision 11)', () => {
  test('nothing moves and the tree is untouched', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await tree.file('src/2025-05-10_10-00-00_A.NEF')
    const before = await tree.list()
    const report = await run({execute: false})
    expect(report.dryRun).toBe(true)
    expect(await tree.list()).toEqual(before)
  })

  test('it reports exactly what a real run then does', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await tree.file('src/2025-05-10_10-00-00_A.NEF')
    await tree.file('src/DSC_0001.NEF')

    const planned = await run({execute: false})
    const actual = await run({execute: true})

    expect(planned.moved.map((m) => m.to).sort()).toEqual(
      actual.moved.map((m) => m.to).sort()
    )
    expect(planned.leftBehind.map((l) => l.reason)).toEqual(
      actual.leftBehind.map((l) => l.reason)
    )
  })

  test('a dry run creates no event folder', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await run({event: '2025-05-10-Iceland', createEvent: true, execute: false})
    expect(await tree.list('archive')).toEqual([])
  })

  test('a dry run writes no manifest', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    const manifest = new Manifest(tree.path('logs/run.jsonl'))
    const report = await run({execute: false, manifest})
    await manifest.close()
    expect(report.manifestPath).toBeNull()
    await expect(tree.read('logs/run.jsonl')).rejects.toThrow()
  })
})

describe('the manifest (decision 14)', () => {
  test('records every move, from and to', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await tree.file('src/2025-05-10_10-00-00_A.NEF')
    const manifest = new Manifest(tree.path('logs/run.jsonl'))
    const report = await run({manifest})
    await manifest.close()

    const entries = await readManifest(tree.path('logs/run.jsonl'))
    expect(entries).toHaveLength(2)
    expect(report.manifestPath).toBe(tree.path('logs/run.jsonl'))
    expect(entries.map((e) => e.to).sort()).toEqual(
      report.moved.map((m) => m.to).sort()
    )
    for (const entry of entries) {
      expect(entry.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })

  test('skipped files are not recorded', async () => {
    await tree.file('archive/sorted/2025/05/2025-05-10_10-00-00_A.JPG')
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    const manifest = new Manifest(tree.path('logs/run.jsonl'))
    const report = await run({manifest})
    await manifest.close()
    expect(report.manifestPath).toBeNull()
  })
})

describe('pre-flight refusals stop the run', () => {
  test('a bad archive root refuses before moving anything', async () => {
    await tree.dir('bad-root')
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await expect(run({archiveRoot: tree.path('bad-root')})).rejects.toThrow(
      PreflightError
    )
    expect(await sourceFiles()).toEqual(['2025-05-10_10-00-00_A.JPG'])
  })

  test('a source inside the archive is refused', async () => {
    await tree.file('archive/sorted/2025/05/2025-05-10_10-00-00_A.JPG')
    await expect(
      run({source: tree.path('archive/sorted/2025/05')})
    ).rejects.toThrow(/inside sorted/)
  })

  test('a layout clash is refused', async () => {
    const event = '2025-05-10-Iceland'
    await tree.file(`archive/events/${event}/footage/2025-05-10_10-00-00_X.JPG`)
    await tree.file('src/2025-05-10_10-00-01_A.JPG')
    await expect(run({event, sourceName: 'dji'})).rejects.toThrow(/flat layout/)
    expect(await sourceFiles()).toEqual(['2025-05-10_10-00-01_A.JPG'])
  })
})

describe('formatReport', () => {
  test('names the dry run and the counts', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await tree.file('src/notes.txt')
    const lines = formatReport(await run({execute: false})).join('\n')
    expect(lines).toMatch(/1 file\(s\) would move/)
    expect(lines).toMatch(/not a known media type \(1\)/)
    expect(lines).toMatch(/Dry run/)
  })

  test('counts bucketed RAWs and points at the manifest', async () => {
    await tree.file('src/2025-05-10_10-00-00_A.JPG')
    await tree.file('src/2025-05-10_10-00-00_A.NEF')
    const manifest = new Manifest(tree.path('logs/run.jsonl'))
    const lines = formatReport(await run({manifest})).join('\n')
    await manifest.close()
    expect(lines).toMatch(/2 file\(s\) moved \(1 paired RAW to raw_versions\)/)
    expect(lines).toMatch(/Manifest:/)
    expect(lines).toMatch(/undo/)
  })
})

describe('colorize', () => {
  // Chalk disables itself when the output is not a TTY, so assert the contract
  // that holds either way: styling may be added, text is never changed.
  const strip = (value: string): string =>
    // eslint-disable-next-line no-control-regex
    value.replaceAll(/\u001B\[\d+m/g, '')

  test('never alters the text of a line', () => {
    for (const line of [
      'Dry run — nothing was moved.',
      '2 file(s) left in place:',
      '3 file(s) moved',
      '',
    ]) {
      expect(strip(colorize(line))).toBe(line)
    }
  })
})
