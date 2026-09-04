import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import {mkdtemp, readdir, realpath, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import nodePath from 'node:path'
import {Temporal} from 'temporal-polyfill'
import {DatifyService, type DatifyConfig} from '../src/lib/DatifyService.ts'

/**
 * Characterisation tests: they record how files get renamed today - the
 * prefix a format produces, the collision counter, the already-prefixed
 * skip, the live-photo infix and the un-prefixing - so the Temporal rewrite
 * has something to be measured against. Exiftool is never called; the four
 * extract methods are stubbed and the filesystem is the assertion.
 */

const DEFAULT_PREFIX = 'yyyy-MM-dd_HH-mm-ss_'

let root: string

beforeEach(async () => {
  root = await realpath(await mkdtemp(nodePath.join(tmpdir(), 'datify-')))
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(async () => {
  await rm(root, {recursive: true, force: true})
  vi.restoreAllMocks()
})

const touch = async (name: string): Promise<string> => {
  const target = nodePath.join(root, name)
  await writeFile(target, name)
  return target
}

const listing = async (): Promise<string[]> => (await readdir(root)).sort()

/** Temporal needs an explicit `[zone]`, so the ISO offset is repeated as one. */
const zoned = (iso: string): Temporal.ZonedDateTime =>
  Temporal.ZonedDateTime.from(
    iso.endsWith('Z') ? `${iso}[UTC]` : `${iso}[${iso.slice(-6)}]`
  )

type Stub = {
  /** What `extractDateTimeFromExif` hands back, or null for "no date". */
  iso: string | null
  /** Marks the file as the video half of a live photo. */
  targetUuid?: string | null
  /** Marks the file as the photo half of a live photo. */
  sourceUuid?: string | null
}

const serviceFor = (
  config: Partial<DatifyConfig>,
  stub: Stub
): DatifyService => {
  const service = new DatifyService({
    prefix: DEFAULT_PREFIX,
    dryRun: false,
    skipBasename: false,
    fileTimeFallback: false,
    srt: false,
    livePhotoInfix: null,
    ...config,
  })

  vi.spyOn(service.exiftoolService, 'extractExifMetadata').mockResolvedValue({})
  vi.spyOn(service.exiftoolService, 'extractDateTimeFromExif').mockReturnValue(
    stub.iso === null
      ? null
      : {
          source: 'EXIF:DateTimeOriginal',
          raw: stub.iso,
          iso: stub.iso,
          when: zoned(stub.iso),
        }
  )
  vi.spyOn(
    service.exiftoolService,
    'extractLivePhotoTargetUuidFromExif'
  ).mockReturnValue(stub.targetUuid ?? null)
  vi.spyOn(
    service.exiftoolService,
    'extractLivePhotoSourceUuidFromExif'
  ).mockReturnValue(stub.sourceUuid ?? null)

  return service
}

describe('DatifyService prefixing', () => {
  describe('the prefix itself', () => {
    test('the default format writes local date and time, underscore-joined', async () => {
      const path = await touch('shot.JPG')
      await serviceFor({}, {iso: '2024-04-06T18:51:45.760+02:00'}).processFile(
        path
      )

      expect(await listing()).toEqual(['2024-04-06_18-51-45_shot.JPG'])
    })

    // The offset in the ISO string is honoured, not converted to the machine's
    // own zone: the prefix reads as the wall clock where the photo was taken.
    test.for([
      ['2024-04-06T18:51:45.000+02:00', '2024-04-06_18-51-45_shot.JPG'],
      ['2024-04-06T18:51:45.000-05:00', '2024-04-06_18-51-45_shot.JPG'],
      ['2024-01-06T00:05:09.000Z', '2024-01-06_00-05-09_shot.JPG'],
      ['2024-12-31T23:59:59.000+05:30', '2024-12-31_23-59-59_shot.JPG'],
    ] as const)('%s becomes %s', async ([iso, expected]) => {
      const path = await touch('shot.JPG')
      await serviceFor({}, {iso}).processFile(path)

      expect(await listing()).toEqual([expected])
    })

    // The prefix is built from `when`, the object the probe already parsed,
    // not from re-reading its `iso` string. A stub whose two fields disagree
    // is the only thing that can tell those apart.
    test('the prefix comes from `when`, not from `iso`', async () => {
      const path = await touch('shot.JPG')
      const service = serviceFor({}, {iso: '2024-04-06T18:51:45.760+02:00'})
      vi.spyOn(
        service.exiftoolService,
        'extractDateTimeFromExif'
      ).mockReturnValue({
        source: 'EXIF:DateTimeOriginal',
        raw: '2024-04-06 18:51:45',
        iso: '2024-04-06T18:51:45.760+02:00',
        when: zoned('1999-09-09T09:09:09.000+02:00'),
      })

      await service.processFile(path)

      expect(await listing()).toEqual(['1999-09-09_09-09-09_shot.JPG'])
    })

    test.for([
      ['yyyyMMdd-HHmmss-', '20240406-185145-shot.JPG'],
      ['yyyy-MM-dd_HH-mm-ss-SSS_', '2024-04-06_18-51-45-760_shot.JPG'],
      ['yyyy-MM-dd_HH-mm-ss_ZZ_', '2024-04-06_18-51-45_+02:00_shot.JPG'],
    ] as const)('the %s format produces %s', async ([prefix, expected]) => {
      const path = await touch('shot.JPG')
      await serviceFor(
        {prefix},
        {iso: '2024-04-06T18:51:45.760+02:00'}
      ).processFile(path)

      expect(await listing()).toEqual([expected])
    })

    // A slash in the format is not a directory feature: no directory is
    // created, so the rename fails and the error escapes to the caller.
    test('a format with a slash in it throws', async () => {
      const path = await touch('shot.JPG')

      await expect(
        serviceFor(
          {prefix: 'yyyy/MM/dd '},
          {iso: '2024-04-06T18:51:45.760+02:00'}
        ).processFile(path)
      ).rejects.toThrow('ENOENT')

      expect(await listing()).toEqual(['shot.JPG'])
    })

    test('skipBasename drops the original name, keeping the extension', async () => {
      const path = await touch('shot.JPG')
      await serviceFor(
        {skipBasename: true, prefix: 'yyyy-MM-dd_HH-mm-ss'},
        {iso: '2024-04-06T18:51:45.760+02:00'}
      ).processFile(path)

      expect(await listing()).toEqual(['2024-04-06_18-51-45.JPG'])
    })
  })

  describe('the collision counter', () => {
    test('the second file with the same prefix gets a 1 before the extension', async () => {
      const first = await touch('a.JPG')
      const second = await touch('b.JPG')

      const iso = '2024-04-06T18:51:45.760+02:00'
      await serviceFor({skipBasename: true}, {iso}).processFile(first)
      await serviceFor({skipBasename: true}, {iso}).processFile(second)

      expect(await listing()).toEqual([
        '2024-04-06_18-51-45_.JPG',
        '2024-04-06_18-51-45_1.JPG',
      ])
    })

    test('the counter keeps climbing, and never uses 0', async () => {
      const iso = '2024-04-06T18:51:45.760+02:00'
      for (const name of ['a.JPG', 'b.JPG', 'c.JPG']) {
        const path = await touch(name)
        await serviceFor({skipBasename: true}, {iso}).processFile(path)
      }

      expect(await listing()).toEqual([
        '2024-04-06_18-51-45_.JPG',
        '2024-04-06_18-51-45_1.JPG',
        '2024-04-06_18-51-45_2.JPG',
      ])
    })
  })

  describe('files that are left alone', () => {
    test('no date at all means no rename', async () => {
      const path = await touch('shot.JPG')
      await serviceFor({}, {iso: null}).processFile(path)

      expect(await listing()).toEqual(['shot.JPG'])
    })

    test('an already-prefixed file is skipped, not prefixed twice', async () => {
      const path = await touch('2024-04-06_18-51-45_shot.JPG')
      await serviceFor({}, {iso: '2024-04-06T18:51:45.760+02:00'}).processFile(
        path
      )

      expect(await listing()).toEqual(['2024-04-06_18-51-45_shot.JPG'])
    })

    // The check is a plain `startsWith` on the prefix, so a file carrying a
    // different date is renamed and keeps its old prefix in the basename.
    test('a file prefixed with a different date is prefixed again', async () => {
      const path = await touch('2020-01-01_00-00-00_shot.JPG')
      await serviceFor({}, {iso: '2024-04-06T18:51:45.760+02:00'}).processFile(
        path
      )

      expect(await listing()).toEqual([
        '2024-04-06_18-51-45_2020-01-01_00-00-00_shot.JPG',
      ])
    })

    test('dryRun prints but renames nothing', async () => {
      const path = await touch('shot.JPG')
      await serviceFor(
        {dryRun: true},
        {iso: '2024-04-06T18:51:45.760+02:00'}
      ).processFile(path)

      expect(await listing()).toEqual(['shot.JPG'])
    })
  })

  describe('live photos', () => {
    test('the video gets the infix between the prefix and the name', async () => {
      const path = await touch('clip.MOV')
      await serviceFor(
        {livePhotoInfix: 'live-photo-'},
        {iso: '2024-04-06T18:51:45.760+02:00', targetUuid: 'uuid-1'}
      ).processFile(path)

      expect(await listing()).toEqual([
        '2024-04-06_18-51-45_live-photo-clip.MOV',
      ])
    })

    test('a file that is not a live-photo video gets no infix', async () => {
      const path = await touch('shot.JPG')
      await serviceFor(
        {livePhotoInfix: 'live-photo-'},
        {iso: '2024-04-06T18:51:45.760+02:00'}
      ).processFile(path)

      expect(await listing()).toEqual(['2024-04-06_18-51-45_shot.JPG'])
    })

    // The photo's time is cached under its uuid, so the video that follows
    // borrows it and both halves land on the same prefix.
    test('the video reuses the photo time, ignoring its own', async () => {
      const service = new DatifyService({
        prefix: DEFAULT_PREFIX,
        dryRun: false,
        skipBasename: false,
        fileTimeFallback: false,
        srt: false,
        livePhotoInfix: 'live-photo-',
      })
      vi.spyOn(
        service.exiftoolService,
        'extractExifMetadata'
      ).mockResolvedValue({})

      const photo = await touch('shot.HEIC')
      vi.spyOn(
        service.exiftoolService,
        'extractDateTimeFromExif'
      ).mockReturnValue({
        source: 'EXIF:DateTimeOriginal',
        raw: '2024-04-06T18:51:45.760+02:00',
        iso: '2024-04-06T18:51:45.760+02:00',
        when: zoned('2024-04-06T18:51:45.760+02:00'),
      })
      vi.spyOn(
        service.exiftoolService,
        'extractLivePhotoTargetUuidFromExif'
      ).mockReturnValue(null)
      vi.spyOn(
        service.exiftoolService,
        'extractLivePhotoSourceUuidFromExif'
      ).mockReturnValue('uuid-1')
      await service.processFile(photo)

      const video = await touch('clip.MOV')
      vi.spyOn(
        service.exiftoolService,
        'extractDateTimeFromExif'
      ).mockReturnValue({
        source: 'EXIF:DateTimeOriginal',
        raw: '1999-09-09T09:09:09.000+02:00',
        iso: '1999-09-09T09:09:09.000+02:00',
        when: zoned('1999-09-09T09:09:09.000+02:00'),
      })
      vi.spyOn(
        service.exiftoolService,
        'extractLivePhotoTargetUuidFromExif'
      ).mockReturnValue('uuid-1')
      vi.spyOn(
        service.exiftoolService,
        'extractLivePhotoSourceUuidFromExif'
      ).mockReturnValue(null)
      await service.processFile(video)

      expect(await listing()).toEqual([
        '2024-04-06_18-51-45_live-photo-clip.MOV',
        '2024-04-06_18-51-45_shot.HEIC',
      ])
    })
  })

  describe('the srt companion', () => {
    test('a matching .srt is renamed alongside the video', async () => {
      const path = await touch('clip.MP4')
      await touch('clip.srt')
      await serviceFor(
        {srt: true},
        {iso: '2024-04-06T18:51:45.760+02:00'}
      ).processFile(path)

      expect(await listing()).toEqual([
        '2024-04-06_18-51-45_clip.MP4',
        '2024-04-06_18-51-45_clip.srt',
      ])
    })

    test('without the flag the .srt is left behind', async () => {
      const path = await touch('clip.MP4')
      await touch('clip.srt')
      await serviceFor(
        {srt: false},
        {iso: '2024-04-06T18:51:45.760+02:00'}
      ).processFile(path)

      expect(await listing()).toEqual([
        '2024-04-06_18-51-45_clip.MP4',
        'clip.srt',
      ])
    })
  })
})

describe('removePrefixFromFile', () => {
  const service = () =>
    new DatifyService({
      prefix: DEFAULT_PREFIX,
      dryRun: false,
      skipBasename: false,
      fileTimeFallback: false,
      srt: false,
      livePhotoInfix: null,
    })

  test('strips the date prefix', async () => {
    const path = await touch('2024-04-06_18-51-45_shot.JPG')
    await service().removePrefixFromFile(path)

    expect(await listing()).toEqual(['shot.JPG'])
  })

  test('strips the live-photo infix along with the prefix', async () => {
    const path = await touch('2024-04-06_18-51-45_live-photo-clip.MOV')
    await service().removePrefixFromFile(path)

    expect(await listing()).toEqual(['clip.MOV'])
  })

  test('only one prefix comes off per call', async () => {
    const path = await touch('2024-04-06_18-51-45_2020-01-01_00-00-00_shot.JPG')
    await service().removePrefixFromFile(path)

    expect(await listing()).toEqual(['2020-01-01_00-00-00_shot.JPG'])
  })

  // The pattern is anchored, and only the exact shape written by the default
  // format is recognised.
  test.for([
    'shot.JPG',
    'holiday_2024-04-06_18-51-45_shot.JPG',
    '20240406-185145-shot.JPG',
    '2024-04-06_18-51-45-shot.JPG',
    '2024-4-6_18-51-45_shot.JPG',
  ])('leaves %s alone', async (name) => {
    const path = await touch(name)
    await service().removePrefixFromFile(path)

    expect(await listing()).toEqual([name])
  })

  test('dryRun renames nothing', async () => {
    const path = await touch('2024-04-06_18-51-45_shot.JPG')
    const dry = new DatifyService({
      prefix: DEFAULT_PREFIX,
      dryRun: true,
      skipBasename: false,
      fileTimeFallback: false,
      srt: false,
      livePhotoInfix: null,
    })
    await dry.removePrefixFromFile(path)

    expect(await listing()).toEqual(['2024-04-06_18-51-45_shot.JPG'])
  })
})
