import {expect, test, describe} from 'vitest'
import {Temporal} from 'temporal-polyfill'
import {ExiftoolService} from '../src/ExiftoolService.ts'

const extract = async (filename: string, zone: string) => {
  const service = new ExiftoolService({})
  const metadata = await service.extractExifMetadata(
    `test/fixtures/${filename}`
  )
  return service.extractDateTimeFromExif({
    metadata,
    fileTimeFallback: false,
    timeZone: zone,
  })
}

/** `when` is an object, so it is compared as its own string form. */
const getDateTime = async (filename: string, zone: string) => {
  const result = await extract(filename, zone)
  return result === null ? null : {...result, when: result.when.toString()}
}

describe('ExiftoolService', () => {
  describe('extractDateTimeFromExif', () => {
    test('extracts correct date from Nikon file', async () => {
      expect(await getDateTime('nikon.jpg', 'Europe/Brussels')).toEqual({
        iso: '2024-04-06T18:51:45.760+02:00',
        raw: '2024:04:06 18:51:45.76',
        source: 'Composite:SubSecDateTimeOriginal',
        when: '2024-04-06T18:51:45.76+02:00[Europe/Brussels]',
      })
    })

    test('extracts correct date from iPhone photo', async () => {
      expect(await getDateTime('iphone.heic', 'Europe/Rome')).toEqual({
        iso: '2024-04-03T10:01:22.219+02:00',
        raw: '2024:04:03 10:01:22.219+02:00',
        source: 'Composite:SubSecDateTimeOriginal',
        when: '2024-04-03T10:01:22.219+02:00[+02:00]',
      })
    })

    test('extracts correct date from iPhone live photo', async () => {
      expect(await getDateTime('iphone-live-photo.mov', 'Europe/Rome')).toEqual(
        {
          iso: '2024-04-03T10:01:21.000+02:00',
          raw: '2024:04:03 10:01:21+02:00',
          source: 'QuickTime:Keys:CreationDate',
          when: '2024-04-03T10:01:21+02:00[+02:00]',
        }
      )
    })

    test('hands back a ZonedDateTime the caller can use directly', async () => {
      const result = await extract('nikon.jpg', 'Europe/Brussels')

      expect(result?.when).toBeInstanceOf(Temporal.ZonedDateTime)
      expect(result?.when.hour).toBe(18)
      expect(result?.when.timeZoneId).toBe('Europe/Brussels')
    })
  })
})
