import {describe, expect, test} from 'vitest'
import {EXIF_TAGS, type ExiftoolMetadata} from '@hwaterke/media-probe'
import {planGopro} from '../src/lib/planGopro.ts'

const MP4 = 'GH013974.MP4'
const JPG = 'GOPR3975.JPG'
const GPR = 'GOPR3976.GPR'
const ZONE = 'Europe/Brussels'

const LOCAL = '2026:09:04 07:58:54'
const UTC = '2026:09:04 05:58:54'
const ANCHOR = '2026:09:04 07:58:54+02:00'

/** A HERO8 Black video straight out of the camera: every date is local time. */
const videoFromCamera = (
  overrides: Partial<ExiftoolMetadata> = {}
): ExiftoolMetadata => ({
  [EXIF_TAGS.GOPRO_MODEL]: 'HERO8 Black',
  'QuickTime:CreateDate': LOCAL,
  'QuickTime:ModifyDate': LOCAL,
  'QuickTime:Track1:TrackCreateDate': LOCAL,
  'QuickTime:Track1:TrackModifyDate': LOCAL,
  'QuickTime:Track1:MediaCreateDate': LOCAL,
  'QuickTime:Track1:MediaModifyDate': LOCAL,
  'QuickTime:Track2:TrackCreateDate': LOCAL,
  'QuickTime:Track2:TrackModifyDate': LOCAL,
  'QuickTime:Track2:MediaCreateDate': LOCAL,
  'QuickTime:Track2:MediaModifyDate': LOCAL,
  ...overrides,
})

/** The same video once this tool has written it: anchor plus UTC everywhere. */
const videoFixed = (
  overrides: Partial<ExiftoolMetadata> = {}
): ExiftoolMetadata =>
  videoFromCamera({
    [EXIF_TAGS.QUICKTIME_CREATION_DATE]: ANCHOR,
    'QuickTime:CreateDate': UTC,
    'QuickTime:ModifyDate': UTC,
    'QuickTime:Track1:TrackCreateDate': UTC,
    'QuickTime:Track1:TrackModifyDate': UTC,
    'QuickTime:Track1:MediaCreateDate': UTC,
    'QuickTime:Track1:MediaModifyDate': UTC,
    'QuickTime:Track2:TrackCreateDate': UTC,
    'QuickTime:Track2:TrackModifyDate': UTC,
    'QuickTime:Track2:MediaCreateDate': UTC,
    'QuickTime:Track2:MediaModifyDate': UTC,
    ...overrides,
  })

/** A HERO8 Black photo straight out of the camera. */
const photoFromCamera = (
  overrides: Partial<ExiftoolMetadata> = {}
): ExiftoolMetadata => ({
  [EXIF_TAGS.EXIF_MAKE]: 'GoPro',
  [EXIF_TAGS.DATE_TIME_ORIGINAL]: '2026:09:04 07:59:16',
  [EXIF_TAGS.EXIF_CREATE_DATE]: '2026:09:04 07:59:16',
  [EXIF_TAGS.SUB_SEC_TIME_ORIGINAL]: '0461',
  ...overrides,
})

describe('planGopro', () => {
  describe('files it will not touch', () => {
    test('ignores an unsupported extension', () => {
      expect(
        planGopro(videoFromCamera(), {path: 'GH013974.LRV', zone: ZONE})
      ).toEqual({
        verdict: 'ignored',
        reason: 'unsupported extension .LRV',
        writes: [],
      })
    })

    test('ignores a video from another camera', () => {
      const metadata = videoFromCamera({[EXIF_TAGS.GOPRO_MODEL]: undefined})
      expect(planGopro(metadata, {path: MP4, zone: ZONE})).toMatchObject({
        verdict: 'ignored',
        reason: 'not a GoPro file',
      })
    })

    test('ignores a photo from another camera', () => {
      const metadata = photoFromCamera({[EXIF_TAGS.EXIF_MAKE]: 'NIKON'})
      expect(planGopro(metadata, {path: JPG, zone: ZONE})).toMatchObject({
        verdict: 'ignored',
        reason: 'not a GoPro file',
      })
    })
  })

  describe('video', () => {
    test('anchors on CreateDate read as local time', () => {
      const plan = planGopro(videoFromCamera(), {path: MP4, zone: ZONE})

      expect(plan.verdict).toBe('written')
      expect(plan.writes).toEqual([
        '-api',
        'QuickTimeUTC',
        `-QuickTime:Keys:CreationDate=${ANCHOR}`,
        `-QuickTime:CreateDate=${ANCHOR}`,
        `-QuickTime:ModifyDate=${ANCHOR}`,
        `-QuickTime:TrackCreateDate=${ANCHOR}`,
        `-QuickTime:TrackModifyDate=${ANCHOR}`,
        `-QuickTime:MediaCreateDate=${ANCHOR}`,
        `-QuickTime:MediaModifyDate=${ANCHOR}`,
      ])
    })

    test('writes nothing on a second run', () => {
      expect(planGopro(videoFixed(), {path: MP4, zone: ZONE})).toEqual({
        verdict: 'ok',
        reason: 'already correct',
        writes: [],
      })
    })

    test('never names a date tag the file does not carry', () => {
      const metadata = videoFromCamera({
        'QuickTime:Track1:MediaCreateDate': undefined,
        'QuickTime:Track1:MediaModifyDate': undefined,
        'QuickTime:Track2:MediaCreateDate': undefined,
        'QuickTime:Track2:MediaModifyDate': undefined,
      })
      const plan = planGopro(metadata, {path: MP4, zone: ZONE})

      expect(plan.writes).not.toContain(`-QuickTime:MediaCreateDate=${ANCHOR}`)
      expect(plan.writes).not.toContain(`-QuickTime:MediaModifyDate=${ANCHOR}`)
    })

    test('repairs a half-written file from the anchor, not from the clock', () => {
      // A crash between the two writes the old code made: the anchor landed,
      // the other tags are still the camera's local time. Reading them as
      // local would shift the file by another two hours.
      const plan = planGopro(
        videoFromCamera({[EXIF_TAGS.QUICKTIME_CREATION_DATE]: ANCHOR}),
        {path: MP4, zone: ZONE}
      )

      expect(plan.verdict).toBe('repaired')
      expect(plan.writes).not.toContain(
        `-QuickTime:Keys:CreationDate=${ANCHOR}`
      )
      expect(plan.writes).toContain(`-QuickTime:CreateDate=${ANCHOR}`)
    })

    test('trusts the anchor over --zone once the file has one', () => {
      const plan = planGopro(videoFixed(), {path: MP4, zone: 'Asia/Tokyo'})

      expect(plan).toEqual({
        verdict: 'ok',
        reason: 'already correct',
        writes: [],
      })
    })

    test('fails when there is no time to anchor on', () => {
      const metadata = videoFromCamera({'QuickTime:CreateDate': undefined})
      expect(planGopro(metadata, {path: MP4, zone: ZONE})).toMatchObject({
        verdict: 'failed',
      })
    })

    test('fails on an unreadable anchor', () => {
      const metadata = videoFixed({
        [EXIF_TAGS.QUICKTIME_CREATION_DATE]: 'not a date',
      })
      expect(planGopro(metadata, {path: MP4, zone: ZONE})).toMatchObject({
        verdict: 'failed',
        reason: 'unreadable QuickTime:Keys:CreationDate not a date',
      })
    })

    test('uses the offset --zone had on the day, not today', () => {
      const winter = videoFromCamera({
        'QuickTime:CreateDate': '2026:01:04 07:58:54',
        'QuickTime:ModifyDate': '2026:01:04 07:58:54',
        'QuickTime:Track1:TrackCreateDate': '2026:01:04 07:58:54',
        'QuickTime:Track1:TrackModifyDate': '2026:01:04 07:58:54',
        'QuickTime:Track1:MediaCreateDate': '2026:01:04 07:58:54',
        'QuickTime:Track1:MediaModifyDate': '2026:01:04 07:58:54',
        'QuickTime:Track2:TrackCreateDate': '2026:01:04 07:58:54',
        'QuickTime:Track2:TrackModifyDate': '2026:01:04 07:58:54',
        'QuickTime:Track2:MediaCreateDate': '2026:01:04 07:58:54',
        'QuickTime:Track2:MediaModifyDate': '2026:01:04 07:58:54',
      })

      expect(planGopro(winter, {path: MP4, zone: ZONE}).writes).toContain(
        '-QuickTime:Keys:CreationDate=2026:01:04 07:58:54+01:00'
      )
    })
  })

  describe('photo', () => {
    test('writes the three offsets', () => {
      const plan = planGopro(photoFromCamera(), {path: JPG, zone: ZONE})

      expect(plan).toEqual({
        verdict: 'written',
        reason: 'offset +02:00',
        writes: [
          '-OffsetTime=+02:00',
          '-OffsetTimeOriginal=+02:00',
          '-OffsetTimeDigitized=+02:00',
        ],
      })
    })

    test('writes nothing on a second run', () => {
      const metadata = photoFromCamera({
        [EXIF_TAGS.EXIF_OFFSET_TIME]: '+02:00',
        [EXIF_TAGS.EXIF_OFFSET_TIME_ORIGINAL]: '+02:00',
        [EXIF_TAGS.EXIF_OFFSET_TIME_DIGITIZED]: '+02:00',
      })
      expect(planGopro(metadata, {path: JPG, zone: ZONE})).toEqual({
        verdict: 'ok',
        reason: 'already correct',
        writes: [],
      })
    })

    test('overwrites the firmware CreateDate on a .GPR', () => {
      const metadata = photoFromCamera({
        [EXIF_TAGS.DATE_TIME_ORIGINAL]: '2026:09:04 07:59:50',
        [EXIF_TAGS.EXIF_CREATE_DATE]: '2016:03:25 15:55:23',
        [EXIF_TAGS.SUB_SEC_TIME_ORIGINAL]: undefined,
      })
      const plan = planGopro(metadata, {path: GPR, zone: ZONE})

      expect(plan.writes).toContain('-EXIF:CreateDate=2026:09:04 07:59:50')
    })

    test('leaves the CreateDate alone on a .JPG', () => {
      const plan = planGopro(photoFromCamera(), {path: JPG, zone: ZONE})

      expect(plan.writes.join(' ')).not.toContain('CreateDate')
    })

    test('fails without a DateTimeOriginal', () => {
      const metadata = photoFromCamera({
        [EXIF_TAGS.DATE_TIME_ORIGINAL]: undefined,
      })
      expect(planGopro(metadata, {path: JPG, zone: ZONE})).toMatchObject({
        verdict: 'failed',
        reason: 'no DateTimeOriginal',
      })
    })

    test('uses the offset --zone had on the day, not today', () => {
      const metadata = photoFromCamera({
        [EXIF_TAGS.DATE_TIME_ORIGINAL]: '2026:01:04 07:59:16',
      })
      expect(planGopro(metadata, {path: JPG, zone: ZONE})).toMatchObject({
        verdict: 'written',
        reason: 'offset +01:00',
      })
    })
  })
})
