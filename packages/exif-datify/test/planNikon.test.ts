import {describe, expect, test} from 'vitest'
import {EXIF_TAGS, type ExiftoolMetadata} from '@hwaterke/media-probe'
import {planNikon} from '../src/lib/planNikon.ts'

const JPG = 'DSC_0001.JPG'
const NEF = 'DSC_0001.NEF'

/** A Nikon D3500 JPG straight out of the camera, in Brussels on 4 Sep 2026. */
const fromCamera = (
  overrides: Partial<ExiftoolMetadata> = {}
): ExiftoolMetadata => ({
  [EXIF_TAGS.EXIF_MAKE]: 'NIKON CORPORATION',
  [EXIF_TAGS.DATE_TIME_ORIGINAL]: '2026:09:04 07:54:42',
  [EXIF_TAGS.SUB_SEC_TIME_ORIGINAL]: 18,
  [EXIF_TAGS.NIKON_TIME_ZONE]: '+01:00',
  [EXIF_TAGS.NIKON_DAYLIGHT_SAVINGS]: 'Yes',
  ...overrides,
})

/** The same JPG once this tool has written the offsets. */
const fixed = (overrides: Partial<ExiftoolMetadata> = {}): ExiftoolMetadata =>
  fromCamera({
    [EXIF_TAGS.EXIF_OFFSET_TIME]: '+02:00',
    [EXIF_TAGS.EXIF_OFFSET_TIME_ORIGINAL]: '+02:00',
    [EXIF_TAGS.EXIF_OFFSET_TIME_DIGITIZED]: '+02:00',
    ...overrides,
  })

describe('planNikon', () => {
  describe('files it will not touch', () => {
    test('skips an unsupported extension', () => {
      expect(planNikon(fromCamera(), {path: 'DSC_0001.MOV'})).toEqual({
        verdict: 'skipped',
        reason: 'unsupported extension .MOV',
        writes: [],
      })
    })

    test('skips a file from another maker', () => {
      const metadata = fromCamera({[EXIF_TAGS.EXIF_MAKE]: 'Canon'})
      expect(planNikon(metadata, {path: JPG})).toMatchObject({
        verdict: 'skipped',
        reason: 'not a Nikon file',
      })
    })

    test('skips when the file has no zone and no --zone is given', () => {
      const metadata = fromCamera({
        [EXIF_TAGS.NIKON_TIME_ZONE]: undefined,
        [EXIF_TAGS.NIKON_DAYLIGHT_SAVINGS]: undefined,
      })
      expect(planNikon(metadata, {path: JPG})).toEqual({
        verdict: 'skipped',
        reason: 'no Nikon MakerNotes and no --zone, cannot prove the offset',
        writes: [],
      })
    })
  })

  describe('malformed files', () => {
    test('fails without a DateTimeOriginal', () => {
      const metadata = fromCamera({
        [EXIF_TAGS.DATE_TIME_ORIGINAL]: undefined,
      })
      expect(planNikon(metadata, {path: JPG})).toMatchObject({
        verdict: 'failed',
        reason: 'no DateTimeOriginal',
      })
    })

    test('fails on half a MakerNotes zone', () => {
      const metadata = fromCamera({
        [EXIF_TAGS.NIKON_DAYLIGHT_SAVINGS]: undefined,
      })
      expect(planNikon(metadata, {path: JPG})).toMatchObject({
        verdict: 'failed',
        reason: 'incomplete Nikon MakerNotes',
      })
    })

    test('fails on an unreadable Nikon:TimeZone', () => {
      const metadata = fromCamera({[EXIF_TAGS.NIKON_TIME_ZONE]: 'CET'})
      expect(planNikon(metadata, {path: JPG})).toMatchObject({
        verdict: 'failed',
        reason: 'unreadable Nikon:TimeZone CET',
      })
    })

    test('fails on an unreadable Nikon:DaylightSavings', () => {
      const metadata = fromCamera({
        [EXIF_TAGS.NIKON_DAYLIGHT_SAVINGS]: 'Maybe',
      })
      expect(planNikon(metadata, {path: JPG})).toMatchObject({
        verdict: 'failed',
        reason: 'unreadable Nikon:DaylightSavings Maybe',
      })
    })

    test('fails on --convert-zone without --zone', () => {
      expect(
        planNikon(fromCamera(), {path: JPG, convertZone: true})
      ).toMatchObject({
        verdict: 'failed',
        reason: '--convert-zone needs --zone',
      })
    })

    test('fails on an unknown zone', () => {
      expect(
        planNikon(fromCamera(), {path: JPG, zone: 'Mars/Olympus'})
      ).toMatchObject({verdict: 'failed'})
    })
  })

  describe('offset derived from the camera', () => {
    test('adds base zone plus DST for a JPG', () => {
      expect(planNikon(fromCamera(), {path: JPG})).toEqual({
        verdict: 'written',
        reason: 'offset +02:00',
        writes: [
          '-OffsetTime=+02:00',
          '-OffsetTimeOriginal=+02:00',
          '-OffsetTimeDigitized=+02:00',
        ],
      })
    })

    test('leaves the base zone alone', () => {
      const {writes} = planNikon(fromCamera(), {path: JPG})
      expect(writes).not.toContainEqual(
        expect.stringContaining('Nikon:TimeZone')
      )
    })

    test('adds no DST step when the camera says No', () => {
      const metadata = fromCamera({
        [EXIF_TAGS.NIKON_DAYLIGHT_SAVINGS]: 'No',
      })
      expect(planNikon(metadata, {path: JPG}).writes).toContain(
        '-OffsetTimeOriginal=+01:00'
      )
    })

    test('also writes the XMP CreateDate on a NEF', () => {
      const metadata = fromCamera({
        [EXIF_TAGS.XMP_CREATE_DATE]: '2026:09:04 07:54:42.18',
      })
      expect(planNikon(metadata, {path: NEF}).writes).toEqual([
        '-OffsetTime=+02:00',
        '-OffsetTimeOriginal=+02:00',
        '-OffsetTimeDigitized=+02:00',
        '-XMP:CreateDate=2026:09:04 07:54:42.18+02:00',
      ])
    })
  })

  describe('idempotency', () => {
    test('a fixed JPG needs nothing', () => {
      expect(planNikon(fixed(), {path: JPG})).toEqual({
        verdict: 'ok',
        reason: 'already correct',
        writes: [],
      })
    })

    test('a fixed NEF needs nothing', () => {
      const metadata = fixed({
        [EXIF_TAGS.XMP_CREATE_DATE]: '2026:09:04 07:54:42.18+02:00',
      })
      expect(planNikon(metadata, {path: NEF})).toMatchObject({verdict: 'ok'})
    })

    test('a half-written NEF only gets its XMP CreateDate', () => {
      const metadata = fixed({
        [EXIF_TAGS.XMP_CREATE_DATE]: '2026:09:04 07:54:42.18',
      })
      expect(planNikon(metadata, {path: NEF})).toMatchObject({
        verdict: 'written',
        writes: ['-XMP:CreateDate=2026:09:04 07:54:42.18+02:00'],
      })
    })
  })

  describe('the historical bug', () => {
    /** Nikon:TimeZone was overwritten with the true offset by an old run. */
    const damaged = fixed({[EXIF_TAGS.NIKON_TIME_ZONE]: '+02:00'})

    test('restores the base zone and touches nothing else', () => {
      expect(planNikon(damaged, {path: JPG})).toMatchObject({
        verdict: 'repaired',
        writes: ['-Nikon:TimeZone=+01:00'],
      })
    })

    test('the repaired file is left alone on the next run', () => {
      const repaired = fixed({[EXIF_TAGS.NIKON_TIME_ZONE]: '+01:00'})
      expect(planNikon(repaired, {path: JPG})).toMatchObject({verdict: 'ok'})
    })

    test('is not detected when DST was off, because nothing was damaged', () => {
      const metadata = fromCamera({
        [EXIF_TAGS.NIKON_DAYLIGHT_SAVINGS]: 'No',
        [EXIF_TAGS.NIKON_TIME_ZONE]: '+01:00',
        [EXIF_TAGS.EXIF_OFFSET_TIME]: '+01:00',
        [EXIF_TAGS.EXIF_OFFSET_TIME_ORIGINAL]: '+01:00',
        [EXIF_TAGS.EXIF_OFFSET_TIME_DIGITIZED]: '+01:00',
      })
      expect(planNikon(metadata, {path: JPG})).toMatchObject({verdict: 'ok'})
    })
  })

  describe('--zone', () => {
    test('agrees with the camera and writes the same offset', () => {
      expect(
        planNikon(fromCamera(), {path: JPG, zone: 'Europe/Brussels'}).writes
      ).toContain('-OffsetTimeOriginal=+02:00')
    })

    test('skips on a disagreement rather than guessing', () => {
      const plan = planNikon(fromCamera(), {path: JPG, zone: 'Europe/London'})
      expect(plan.verdict).toBe('skipped')
      expect(plan.writes).toEqual([])
      expect(plan.reason).toContain('camera says +02:00 but Europe/London')
    })

    test('supplies the offset when the file carries no MakerNotes', () => {
      const metadata = fromCamera({
        [EXIF_TAGS.NIKON_TIME_ZONE]: undefined,
        [EXIF_TAGS.NIKON_DAYLIGHT_SAVINGS]: undefined,
      })
      expect(planNikon(metadata, {path: JPG, zone: 'Europe/Brussels'})).toEqual(
        {
          verdict: 'written',
          reason: 'offset +02:00',
          writes: [
            '-OffsetTime=+02:00',
            '-OffsetTimeOriginal=+02:00',
            '-OffsetTimeDigitized=+02:00',
          ],
        }
      )
    })

    test('asks the zone for the base offset instead of assuming an hour', () => {
      // Lord Howe Island shifts by 30 minutes, not 60.
      const metadata = fromCamera({
        [EXIF_TAGS.DATE_TIME_ORIGINAL]: '2026:01:15 12:00:00',
        [EXIF_TAGS.NIKON_TIME_ZONE]: '+11:00',
        [EXIF_TAGS.NIKON_DAYLIGHT_SAVINGS]: 'No',
      })
      const plan = planNikon(metadata, {
        path: JPG,
        zone: 'Australia/Lord_Howe',
      })
      expect(plan.writes).toContain('-OffsetTimeOriginal=+11:00')
      expect(plan.writes).toContain('-Nikon:TimeZone=+10:30')
    })
  })

  describe('--convert-zone', () => {
    const options = {
      path: NEF,
      zone: 'America/New_York',
      convertZone: true,
    }

    test('keeps the instant and re-expresses it in the target zone', () => {
      const metadata = fromCamera({
        [EXIF_TAGS.XMP_CREATE_DATE]: '2026:09:04 07:54:42.18',
      })
      // 07:54:42+02:00 is 01:54:42-04:00, the same moment.
      expect(planNikon(metadata, options)).toMatchObject({
        verdict: 'written',
        writes: [
          '-OffsetTime=-04:00',
          '-OffsetTimeOriginal=-04:00',
          '-OffsetTimeDigitized=-04:00',
          '-Nikon:TimeZone=-05:00',
          '-AllDates=2026:09:04 01:54:42',
          '-XMP:CreateDate=2026:09:04 01:54:42.18-04:00',
        ],
      })
    })

    test('rewrites DaylightSavings when the target zone has none', () => {
      // Same instant in Tokyo: 05:54:42 UTC is 14:54:42+09:00, DST unknown there.
      const plan = planNikon(fromCamera(), {
        path: JPG,
        zone: 'Asia/Tokyo',
        convertZone: true,
      })
      expect(plan.writes).toEqual([
        '-OffsetTime=+09:00',
        '-OffsetTimeOriginal=+09:00',
        '-OffsetTimeDigitized=+09:00',
        '-Nikon:TimeZone=+09:00',
        '-Nikon:DaylightSavings=No',
        '-AllDates=2026:09:04 14:54:42',
      ])
    })

    test('converges, so a second run cannot shift the clock again', () => {
      const converted: ExiftoolMetadata = {
        [EXIF_TAGS.EXIF_MAKE]: 'NIKON CORPORATION',
        [EXIF_TAGS.DATE_TIME_ORIGINAL]: '2026:09:04 01:54:42',
        [EXIF_TAGS.SUB_SEC_TIME_ORIGINAL]: 18,
        [EXIF_TAGS.NIKON_TIME_ZONE]: '-05:00',
        [EXIF_TAGS.NIKON_DAYLIGHT_SAVINGS]: 'Yes',
        [EXIF_TAGS.EXIF_OFFSET_TIME]: '-04:00',
        [EXIF_TAGS.EXIF_OFFSET_TIME_ORIGINAL]: '-04:00',
        [EXIF_TAGS.EXIF_OFFSET_TIME_DIGITIZED]: '-04:00',
        [EXIF_TAGS.XMP_CREATE_DATE]: '2026:09:04 01:54:42.18-04:00',
      }
      expect(planNikon(converted, options)).toMatchObject({verdict: 'ok'})
      // And with the flag dropped, too.
      expect(
        planNikon(converted, {path: NEF, zone: 'America/New_York'})
      ).toMatchObject({verdict: 'ok'})
    })
  })

  describe('sub-seconds', () => {
    test('copies the digits verbatim, leading zero and all', () => {
      const metadata = fromCamera({
        [EXIF_TAGS.SUB_SEC_TIME_ORIGINAL]: '0461',
      })
      expect(planNikon(metadata, {path: NEF}).writes).toContain(
        '-XMP:CreateDate=2026:09:04 07:54:42.0461+02:00'
      )
    })

    test('omits the fraction when the file has none', () => {
      const metadata = fromCamera({
        [EXIF_TAGS.SUB_SEC_TIME_ORIGINAL]: undefined,
      })
      expect(planNikon(metadata, {path: NEF}).writes).toContain(
        '-XMP:CreateDate=2026:09:04 07:54:42+02:00'
      )
    })
  })
})
