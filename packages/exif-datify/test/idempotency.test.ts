import {afterAll, describe, expect, test} from 'vitest'
import {EXIF_TAGS, ExiftoolService} from '@hwaterke/media-probe'
import {existsSync, promises as FS} from 'node:fs'
import nodePath from 'node:path'
import os from 'node:os'
import {applyPlan} from '../src/lib/applyPlan.ts'
import type {Plan} from '../src/lib/plan.ts'
import {planGopro} from '../src/lib/planGopro.ts'
import {planNikon} from '../src/lib/planNikon.ts'

/**
 * The only tests here that touch real camera files. They need the sample
 * footage, which is 87 MB and deliberately not in git, so the whole suite skips
 * itself when the folder is absent - a fresh clone still passes.
 */
const FIXTURES = nodePath.join(
  os.homedir(),
  'Developer/toolbox-fixtures/footage-from-camera'
)

const ZONE = 'Europe/Brussels'
const service = new ExiftoolService({})
const scratch: string[] = []

afterAll(async () => {
  await Promise.all(
    scratch.map((dir) => FS.rm(dir, {recursive: true, force: true}))
  )
})

/** Copies one fixture into a throwaway directory and hands back its path. */
const copyFixture = async (name: string): Promise<string> => {
  const dir = await FS.mkdtemp(nodePath.join(os.tmpdir(), 'exif-datify-'))
  scratch.push(dir)
  const path = nodePath.join(dir, nodePath.basename(name))
  await FS.copyFile(nodePath.join(FIXTURES, name), path)
  return path
}

const write = async (path: string, args: string[]): Promise<void> => {
  await service.exiftool({
    args: ['-P', ...args],
    path,
    options: {override: true, ignoreMinorErrors: true, dryRun: false},
  })
}

/** Plans against the file as it is on disk, then carries the plan out. */
const runOnce = async (
  path: string,
  planner: (path: string) => Promise<Plan>
): Promise<Plan> => {
  const plan = await planner(path)
  await applyPlan({path, plan, exifService: service, dryRun: false})
  return plan
}

const nikon = async (path: string): Promise<Plan> =>
  planNikon(await service.extractExifMetadata(path), {path})

const gopro = async (path: string): Promise<Plan> =>
  planGopro(await service.extractExifMetadata(path), {path, zone: ZONE})

const SETTLED: Plan = {verdict: 'ok', reason: 'already correct', writes: []}

describe.skipIf(!existsSync(FIXTURES))('real camera files', () => {
  describe('nikon', () => {
    test.for(['nikon/DSC_0001.JPG', 'nikon/DSC_0001.NEF'])(
      '%s settles after one run',
      async (name) => {
        const path = await copyFixture(name)

        expect((await runOnce(path, nikon)).verdict).toBe('written')
        expect(await runOnce(path, nikon)).toEqual(SETTLED)
      },
      60_000
    )

    test('repairs a file the old buggy version wrote, then leaves it alone', async () => {
      const path = await copyFixture('nikon/DSC_0001.NEF')
      // What the old version produced: a correct offset, but Nikon:TimeZone
      // overwritten with it instead of left at the base zone.
      await write(path, [
        '-OffsetTime=+02:00',
        '-OffsetTimeOriginal=+02:00',
        '-OffsetTimeDigitized=+02:00',
        '-Nikon:TimeZone=+02:00',
      ])

      expect((await runOnce(path, nikon)).verdict).toBe('repaired')

      const repaired = await service.extractExifMetadata(path)
      expect(repaired[EXIF_TAGS.NIKON_TIME_ZONE]).toBe('+01:00')
      expect(repaired[EXIF_TAGS.EXIF_OFFSET_TIME_ORIGINAL]).toBe('+02:00')

      expect(await runOnce(path, nikon)).toEqual(SETTLED)
    }, 60_000)
  })

  describe('gopro', () => {
    test.for([
      'gopro/GH013974.MP4',
      'gopro/GOPR3975.JPG',
      'gopro/GOPR3976.JPG',
      'gopro/GOPR3976.GPR',
    ])(
      '%s settles after one run',
      async (name) => {
        const path = await copyFixture(name)

        expect((await runOnce(path, gopro)).verdict).toBe('written')
        expect(await runOnce(path, gopro)).toEqual(SETTLED)
      },
      60_000
    )

    test('finishes a crashed run from the anchor instead of shifting again', async () => {
      const path = await copyFixture('gopro/GH013974.MP4')
      // A crash between the two writes the old version made: the anchor
      // landed, every other tag is still the camera's local time. Reading
      // those as local would cost another two hours.
      await write(path, [
        '-api',
        'QuickTimeUTC',
        '-QuickTime:Keys:CreationDate=2026:09:04 07:58:54+02:00',
      ])

      expect((await runOnce(path, gopro)).verdict).toBe('repaired')

      const repaired = await service.extractExifMetadata(path)
      expect(repaired[EXIF_TAGS.QUICKTIME_CREATION_DATE]).toBe(
        '2026:09:04 07:58:54+02:00'
      )
      expect(repaired[EXIF_TAGS.QUICKTIME_CREATE_DATE]).toBe(
        '2026:09:04 05:58:54'
      )

      expect(await runOnce(path, gopro)).toEqual(SETTLED)
    }, 60_000)
  })
})
