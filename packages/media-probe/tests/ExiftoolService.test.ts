import {expect, test, describe} from 'vitest'
import {ExiftoolService} from '../src/ExiftoolService.js'

const getDateTime = async (filename: string, zone: string) => {
  const service = new ExiftoolService({})
  const metadata = await service.extractExifMetadata(
    `tests/fixtures/${filename}`
  )
  return service.extractDateTimeFromExif({
    metadata,
    fileTimeFallback: false,
    timeZone: zone,
  })
}

describe('ExiftoolService', () => {
  describe('extractDateTimeFromExif', () => {
    test('extracts correct date from Nikon file', async () => {
      expect(await getDateTime('nikon.jpg', 'Europe/Brussels')).toEqual({
        iso: '2024-04-06T18:51:45.760+02:00',
        raw: '2024:04:06 18:51:45.76',
        source: 'Composite:SubSecDateTimeOriginal',
      })
    })

    test('extracts correct date from iPhone photo', async () => {
      expect(await getDateTime('iphone.heic', 'Europe/Rome')).toEqual({
        iso: '2024-04-03T10:01:22.219+02:00',
        raw: '2024:04:03 10:01:22.219+02:00',
        source: 'Composite:SubSecDateTimeOriginal',
      })
    })

    test('extracts correct date from iPhone live photo', async () => {
      expect(await getDateTime('iphone-live-photo.mov', 'Europe/Rome')).toEqual(
        {
          iso: '2024-04-03T10:01:21.000+02:00',
          raw: '2024:04:03 10:01:21+02:00',
          source: 'QuickTime:Keys:CreationDate',
        }
      )
    })
  })
})
