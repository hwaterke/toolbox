import {afterEach, beforeEach, describe, expect, test} from 'vitest'
import {lintArchive} from '../src/lib/lint.ts'
import {exitCode} from '../src/lib/lintReport.ts'
import {PreflightError} from '../src/lib/preflight.ts'
import {makeTempTree, type TempTree} from './utils/tempArchive.ts'

let tree: TempTree

beforeEach(async () => {
  tree = await makeTempTree()
})

afterEach(async () => {
  await tree.cleanup()
})

const base = {strict: false, verbose: false, maxDaysEarly: 1}

/** A small archive: one clean event, and one of a few known faults. */
const seed = async (): Promise<void> => {
  await tree.file('fs-ignore', '.DS_Store\n@eaDir/\n')

  const iceland = 'events/2025-05-10-Iceland/footage'
  await tree.file(`${iceland}/dji/2025-05-10_10-00-00_A.JPG`)
  await tree.file(`${iceland}/raw_versions/dji/2025-05-10_10-00-00_A.DNG`)
  await tree.file(`${iceland}/.DS_Store`)

  // A bare date: no name part at all.
  await tree.dir('events/2019-08-11/footage')

  // An event that is exports only, which is a warning, not an error.
  await tree.dir('events/2020-01-01-NoFootage/exports')

  // A file where only folders belong.
  await tree.file('notes.txt')

  await tree.file('sorted/2025/05/2025-05-01_09-00-00_C.JPG')
}

const idsOf = (findings: readonly {ruleId: string}[]): string[] =>
  [...new Set(findings.map((finding) => finding.ruleId))].sort()

describe('lintArchive', () => {
  test('refuses a root that is neither events/ nor sorted/', async () => {
    await tree.dir('pictures')
    await expect(
      lintArchive({archiveRoot: tree.root, ...base})
    ).rejects.toThrow(PreflightError)
  })

  test('refuses a root that is not there', async () => {
    await expect(
      lintArchive({archiveRoot: tree.path('nope'), ...base})
    ).rejects.toThrow(PreflightError)
  })

  test('refuses an unknown --rule and an --only outside the archive', async () => {
    await seed()
    await expect(
      lintArchive({archiveRoot: tree.root, rules: ['no-such-rule'], ...base})
    ).rejects.toThrow(/Unknown rule/)
    await expect(
      lintArchive({archiveRoot: tree.root, only: ['/elsewhere'], ...base})
    ).rejects.toThrow(/outside the archive/)
  })

  test('reports the seeded faults and counts what it walked', async () => {
    await seed()
    const report = await lintArchive({archiveRoot: tree.root, ...base})

    expect(idsOf(report.findings)).toStrictEqual([
      'event-footage-missing',
      'event-name-format',
      'root-file',
    ])
    expect(report.files).toBe(3)
    expect(report.scopes).toBeGreaterThan(0)
    expect(exitCode(report)).toBe(1)
  })

  test('a clean archive reports nothing and exits 0', async () => {
    await tree.file('fs-ignore', '.DS_Store\n@eaDir/\n')
    await tree.file('sorted/2025/05/2025-05-01_09-00-00_C.JPG')
    await tree.dir('events')

    const report = await lintArchive({archiveRoot: tree.root, ...base})
    expect(report.findings).toStrictEqual([])
    expect(exitCode(report)).toBe(0)
  })

  test('--rule runs that rule alone', async () => {
    await seed()
    const report = await lintArchive({
      archiveRoot: tree.root,
      rules: ['root-file'],
      ...base,
    })

    expect(idsOf(report.findings)).toStrictEqual(['root-file'])
  })

  test('--only judges one event and leaves the rest unread', async () => {
    await seed()
    const report = await lintArchive({
      archiveRoot: tree.root,
      only: [tree.path('events/2019-08-11')],
      ...base,
    })

    expect(idsOf(report.findings)).toStrictEqual(['event-name-format'])
    expect(report.scopes).toBe(1)
    expect(report.files).toBe(0)
  })

  test('reports progress once per scope', async () => {
    await seed()
    const messages: string[] = []
    const report = await lintArchive({
      archiveRoot: tree.root,
      onProgress: (message) => messages.push(message),
      ...base,
    })

    expect(messages).toHaveLength(report.scopes)
    expect(messages).toContain('2025-05-10-Iceland — 2 file(s)')
  })

  test('measures the run with the clock it is given', async () => {
    await seed()
    let clock = 1000
    const report = await lintArchive({
      archiveRoot: tree.root,
      now: () => (clock += 500),
      ...base,
    })

    expect(report.durationMs).toBeGreaterThan(0)
  })
})
