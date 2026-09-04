import {afterEach, describe, expect, test, vi} from 'vitest'
import {DateTime} from 'luxon'
import {ExiftoolService} from '@hwaterke/media-probe'
import {updateTime} from '../src/lib/utils.ts'

/**
 * Characterisation tests: they record what `updateTime` sends to exiftool
 * today, down to the exact strings, so the Temporal rewrite has something to
 * be measured against. Nothing here shells out - the three setters are
 * spied on and the arguments are the assertion.
 */

const at = (iso: string): DateTime => DateTime.fromISO(iso, {setZone: true})

const spy = () => {
  const exifService = new ExiftoolService({})
  return {
    exifService,
    quickTime: vi
      .spyOn(exifService, 'setQuickTimeCreationDate')
      .mockResolvedValue(undefined),
    allTime: vi.spyOn(exifService, 'setAllTime').mockResolvedValue(undefined),
    offsets: vi
      .spyOn(exifService, 'setTimezoneOffsets')
      .mockResolvedValue(undefined),
  }
}

const VIDEO_EXTENSIONS = ['.MOV', '.MP4'] as const
const PHOTO_EXTENSIONS = ['.DNG', '.JPG', '.NEF', '.PNG'] as const

afterEach(() => {
  vi.restoreAllMocks()
})

describe('updateTime', () => {
  describe('videos', () => {
    test.for(VIDEO_EXTENSIONS)(
      '%s writes the creation date and all times',
      async (ext) => {
        const {exifService, quickTime, allTime, offsets} = spy()

        await updateTime({
          path: `/photos/clip${ext}`,
          ext,
          time: at('2024-04-06T18:51:45.000+02:00'),
          exifService,
          dryRun: false,
        })

        expect(quickTime).toHaveBeenCalledWith(
          `/photos/clip${ext}`,
          '2024:04:06 18:51:45+02:00',
          {override: true, ignoreMinorErrors: true, dryRun: false}
        )
        expect(allTime).toHaveBeenCalledWith(
          `/photos/clip${ext}`,
          '2024:04:06 18:51:45+02:00',
          {override: true, ignoreMinorErrors: true, file: false, dryRun: false}
        )
        // Videos carry the offset in the value itself, so the EXIF offset tags
        // are left alone.
        expect(offsets).not.toHaveBeenCalled()
      }
    )

    test('drops sub-seconds, even when the time has them', async () => {
      const {exifService, quickTime, allTime} = spy()

      await updateTime({
        path: '/photos/clip.MOV',
        ext: '.MOV',
        time: at('2024-04-06T18:51:45.760+02:00'),
        exifService,
        dryRun: false,
      })

      expect(quickTime.mock.calls[0]?.[1]).toBe('2024:04:06 18:51:45+02:00')
      expect(allTime.mock.calls[0]?.[1]).toBe('2024:04:06 18:51:45+02:00')
    })

    test('writes the creation date before the other times', async () => {
      const {exifService, quickTime, allTime} = spy()

      await updateTime({
        path: '/photos/clip.MP4',
        ext: '.MP4',
        time: at('2024-04-06T18:51:45.000+02:00'),
        exifService,
        dryRun: false,
      })

      expect(quickTime.mock.invocationCallOrder[0]).toBeLessThan(
        allTime.mock.invocationCallOrder[0]!
      )
    })

    test('passes dryRun through to both calls', async () => {
      const {exifService, quickTime, allTime} = spy()

      await updateTime({
        path: '/photos/clip.MOV',
        ext: '.MOV',
        time: at('2024-04-06T18:51:45.000+02:00'),
        exifService,
        dryRun: true,
      })

      expect(quickTime.mock.calls[0]?.[2]).toMatchObject({dryRun: true})
      expect(allTime.mock.calls[0]?.[2]).toMatchObject({dryRun: true})
    })
  })

  describe('photos', () => {
    test.for(PHOTO_EXTENSIONS)(
      '%s writes the offsets and all times',
      async (ext) => {
        const {exifService, quickTime, allTime, offsets} = spy()

        await updateTime({
          path: `/photos/shot${ext}`,
          ext,
          time: at('2024-04-06T18:51:45.000+02:00'),
          exifService,
          dryRun: false,
        })

        expect(offsets).toHaveBeenCalledWith(`/photos/shot${ext}`, '+02:00', {
          ignoreMinorErrors: true,
          override: true,
          dryRun: false,
        })
        expect(allTime).toHaveBeenCalledWith(
          `/photos/shot${ext}`,
          '2024:04:06 18:51:45+02:00',
          {override: true, ignoreMinorErrors: true, file: false, dryRun: false}
        )
        // Photos are not QuickTime containers.
        expect(quickTime).not.toHaveBeenCalled()
      }
    )

    test('writes the offsets before the times', async () => {
      const {exifService, allTime, offsets} = spy()

      await updateTime({
        path: '/photos/shot.JPG',
        ext: '.JPG',
        time: at('2024-04-06T18:51:45.000+02:00'),
        exifService,
        dryRun: false,
      })

      expect(offsets.mock.invocationCallOrder[0]).toBeLessThan(
        allTime.mock.invocationCallOrder[0]!
      )
    })

    describe('the sub-second branch', () => {
      const timeString = async (iso: string): Promise<string> => {
        const {exifService, allTime} = spy()
        await updateTime({
          path: '/photos/shot.JPG',
          ext: '.JPG',
          time: at(iso),
          exifService,
          dryRun: false,
        })
        return allTime.mock.calls[0]![1]
      }

      test('a whole second gets no fraction at all', async () => {
        expect(await timeString('2024-04-06T18:51:45.000+02:00')).toBe(
          '2024:04:06 18:51:45+02:00'
        )
      })

      test('a fraction is written as hundredths', async () => {
        expect(await timeString('2024-04-06T18:51:45.760+02:00')).toBe(
          '2024:04:06 18:51:45.76+02:00'
        )
      })

      // Truncation, not rounding: .045 becomes .04, and anything under 10 ms
      // becomes .00 while still taking the sub-second branch.
      test('hundredths are truncated, never rounded', async () => {
        expect(await timeString('2024-04-06T18:51:45.045+02:00')).toBe(
          '2024:04:06 18:51:45.04+02:00'
        )
      })

      test('under 10 ms still writes a fraction, and it is zero', async () => {
        expect(await timeString('2024-04-06T18:51:45.007+02:00')).toBe(
          '2024:04:06 18:51:45.00+02:00'
        )
      })
    })

    describe('offsets', () => {
      const offsetString = async (iso: string): Promise<string> => {
        const {exifService, offsets} = spy()
        await updateTime({
          path: '/photos/shot.JPG',
          ext: '.JPG',
          time: at(iso),
          exifService,
          dryRun: false,
        })
        return offsets.mock.calls[0]![1]
      }

      test.for([
        ['2024-04-06T18:51:45.000+02:00', '+02:00'],
        ['2024-01-06T18:51:45.000-05:00', '-05:00'],
        ['2024-01-06T18:51:45.000+05:30', '+05:30'],
        ['2024-01-06T18:51:45.000Z', '+00:00'],
      ] as const)('%s writes %s', async ([iso, expected]) => {
        expect(await offsetString(iso)).toBe(expected)
      })
    })

    test('passes dryRun through to both calls', async () => {
      const {exifService, allTime, offsets} = spy()

      await updateTime({
        path: '/photos/shot.JPG',
        ext: '.JPG',
        time: at('2024-04-06T18:51:45.000+02:00'),
        exifService,
        dryRun: true,
      })

      expect(offsets.mock.calls[0]?.[2]).toMatchObject({dryRun: true})
      expect(allTime.mock.calls[0]?.[2]).toMatchObject({dryRun: true})
    })
  })

  describe('anything else', () => {
    const rejects = async (ext: string) => {
      const {exifService, quickTime, allTime, offsets} = spy()

      await expect(
        updateTime({
          path: `/photos/shot${ext}`,
          ext,
          time: at('2024-04-06T18:51:45.000+02:00'),
          exifService,
          dryRun: false,
        })
      ).rejects.toThrow('Unsupported file type')

      expect(quickTime).not.toHaveBeenCalled()
      expect(allTime).not.toHaveBeenCalled()
      expect(offsets).not.toHaveBeenCalled()
    }

    test.for(['.HEIC', '.GPR', '.SRT', ''])('rejects %o', async (ext) => {
      await rejects(ext)
    })

    // Callers all upper-case the extension before calling in; a lower-case one
    // is not recognised.
    test.for(['.jpg', '.mov'])('rejects lower-case %s', async (ext) => {
      await rejects(ext)
    })
  })
})
