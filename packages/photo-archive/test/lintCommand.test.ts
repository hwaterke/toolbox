import {execFile} from 'node:child_process'
import nodePath from 'node:path'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'
import type {LintJson} from '../src/lib/lintReport.ts'
import {RULES} from '../src/lib/rules/index.ts'
import {makeTempTree, type TempTree} from './utils/tempArchive.ts'

const run = promisify(execFile)
const BIN = nodePath.join(
  nodePath.dirname(fileURLToPath(import.meta.url)),
  '..',
  'bin',
  'run.ts'
)

let tree: TempTree

beforeEach(async () => {
  tree = await makeTempTree()
})

afterEach(async () => {
  await tree.cleanup()
})

/**
 * An archive holding one violation of every rule, each kept in its own event or
 * folder so the rules do not shadow each other.
 */
const seedOnePerRule = async (): Promise<void> => {
  await tree.file('fs-ignore', '.DS_Store\n@eaDir/\n')

  // root-file, root-unknown-folder
  await tree.file('notes.txt')
  await tree.dir('ai')

  // person-folder-media, person-folder-unknown, person-folder-empty
  await tree.file('relations/sarah/2025-05-10_10-00-00_P.JPG')
  await tree.dir('relations/sarah/misc')
  await tree.dir('relations/nobody')

  // event-name-format, event-footage-missing
  await tree.dir('events/2019-08-11')

  // event-name-date
  await tree.dir('events/2025-02-30-Trip/footage')

  // event-unknown-entry
  await tree.file('events/2025-05-14-Stray/stray.txt')
  await tree.dir('events/2025-05-14-Stray/footage')

  // bucket-not-mirrored, bucket-orphan-folder, bucket-non-raw, raw-orphan
  const iceland = 'events/2025-05-10-Iceland/footage'
  await tree.file(`${iceland}/dji/2025-05-10_10-00-00_A.JPG`)
  await tree.file(`${iceland}/raw_versions/2025-05-10_10-00-00_A.DNG`)
  await tree.dir(`${iceland}/raw_versions/ghost`)
  await tree.file(`${iceland}/raw_versions/2025-05-10_11-00-00_B.JPG`)
  await tree.file(`${iceland}/raw_versions/2025-05-10_12-00-00_C.DNG`)

  // event-name-case, raw-loose-pair, missing-date-prefix, unrecognised-file,
  // sidecar-file, media-before-event
  const myTrip = 'events/2025-05-11-my-trip/footage'
  await tree.file(`${myTrip}/2025-05-11_10-00-00_D.JPG`)
  await tree.file(`${myTrip}/2025-05-11_10-00-00_D.DNG`)
  await tree.file(`${myTrip}/IMG_0001.JPG`)
  await tree.file(`${myTrip}/notes.txt`)
  await tree.file(`${myTrip}/clip.thm`)
  await tree.file(`${myTrip}/2025-05-08_10-00-00_E.JPG`)

  // footage-layout-mixed, source-folder-case, source-folder-nesting
  const mixed = 'events/2025-05-12-Mixed/footage'
  await tree.file(`${mixed}/2025-05-12_10-00-00_F.JPG`)
  await tree.file(`${mixed}/DJI-Bad/sub/2025-05-12_10-00-00_G.JPG`)

  // raw-ambiguous-pair
  const ambiguous = 'events/2025-05-13-Ambiguous/footage'
  await tree.file(`${ambiguous}/2025-05-13_15-26-02_DJI_1.DNG`)
  await tree.file(`${ambiguous}/2025-05-13_15-26-03_DJI_1.JPG`)
  await tree.file(`${ambiguous}/2025-05-13_15-26-04_DJI_1.JPG`)

  // sorted-year-folder, sorted-month-folder, sorted-year-file,
  // sorted-month-entry, sorted-bucket-nesting
  await tree.dir('sorted/misc')
  await tree.dir('sorted/2025/summer')
  await tree.file('sorted/2025/2025-05-01_09-00-00_H.JPG')
  await tree.dir('sorted/2025/05/extra')
  await tree.dir('sorted/2025/05/raw_versions/nested')
}

/** Run the real CLI and parse its JSON. */
const lint = async (
  ...flags: string[]
): Promise<{json: LintJson; code: number}> => {
  try {
    const {stdout} = await run(process.execPath, [
      BIN,
      'lint',
      tree.root,
      '--format',
      'json',
      ...flags,
    ])
    return {json: JSON.parse(stdout) as LintJson, code: 0}
  } catch (error) {
    const failure = error as {code?: number; stdout?: string}
    return {
      json: JSON.parse(failure.stdout ?? '') as LintJson,
      code: failure.code ?? 0,
    }
  }
}

describe('photo-archive lint --format json', () => {
  test('fires every rule at least once on an archive seeded for all of them', async () => {
    await seedOnePerRule()
    const {json, code} = await lint()

    const fired = [...new Set(json.findings.map((f) => f.ruleId))].sort()
    expect(fired).toStrictEqual(RULES.map((rule) => rule.id).sort())
    expect(code).toBe(1)
  }, 30_000)

  test('prints nothing but JSON, and describes the run', async () => {
    await seedOnePerRule()
    const {json} = await lint()

    expect(Object.keys(json).sort()).toStrictEqual([
      'archiveRoot',
      'durationMs',
      'exitCode',
      'files',
      'findings',
      'scopes',
      'strict',
    ])
    expect(json.archiveRoot).toBe(tree.root)
    expect(json.exitCode).toBe(1)
    expect(json.strict).toBe(false)
    expect(json.files).toBeGreaterThan(0)
    expect(json.scopes).toBeGreaterThan(0)
  }, 30_000)

  test('every finding carries a rule, a severity, a path and a scope', async () => {
    await seedOnePerRule()
    const {json} = await lint()

    for (const finding of json.findings) {
      expect([
        finding.ruleId.length > 0,
        ['error', 'warning', 'info'].includes(finding.severity),
        finding.path.startsWith(tree.root),
        finding.scope.length > 0,
      ]).toStrictEqual([true, true, true, true])
    }
  }, 30_000)

  test('--rule narrows the JSON to that rule', async () => {
    await seedOnePerRule()
    const {json} = await lint('--rule', 'root-file')

    expect(json.findings.map((f) => f.ruleId)).toStrictEqual(['root-file'])
  }, 30_000)

  test('a clean archive exits 0 with no findings', async () => {
    await tree.file('fs-ignore', '.DS_Store\n@eaDir/\n')
    await tree.dir('events')
    await tree.file('sorted/2025/05/2025-05-01_09-00-00_H.JPG')

    const {json, code} = await lint()
    expect(json.findings).toStrictEqual([])
    expect(json.exitCode).toBe(0)
    expect(code).toBe(0)
  }, 30_000)
})
