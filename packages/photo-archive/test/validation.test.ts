import {describe, expect, test} from 'vitest'
import {
  checkSourceLocation,
  isInsideBucket,
  isRealDate,
  isValidEventName,
  isValidSourceSegment,
} from '../src/lib/validation.ts'

describe('isInsideBucket', () => {
  test('matches raw_versions as an exact path component', () => {
    expect(isInsideBucket('/a/raw_versions/x.dng')).toBe(true)
    expect(isInsideBucket('/a/footage/raw_versions/x.dng')).toBe(true)
  })

  test('a folder that merely ends in the name does not count', () => {
    expect(isInsideBucket('/a/footage_raw_versions/x.dng')).toBe(false)
    expect(isInsideBucket('/a/raw_versions_old/x.dng')).toBe(false)
  })

  test('an unrelated path does not match', () => {
    expect(isInsideBucket('/a/b/x.dng')).toBe(false)
  })
})

describe('isValidEventName', () => {
  test('accepts YYYY-MM-DD-Name', () => {
    expect(isValidEventName('2025-05-10-Iceland')).toBe(true)
  })

  test('accepts a name containing dashes', () => {
    expect(isValidEventName('2025-05-10-Road-Trip-North')).toBe(true)
  })

  test('rejects a missing or empty name', () => {
    expect(isValidEventName('2025-05-10')).toBe(false)
    expect(isValidEventName('2025-05-10-')).toBe(false)
  })

  test('rejects a missing or malformed date', () => {
    expect(isValidEventName('Iceland')).toBe(false)
    expect(isValidEventName('2025-5-10-Iceland')).toBe(false)
    expect(isValidEventName('25-05-10-Iceland')).toBe(false)
  })

  test('rejects an impossible month or day', () => {
    expect(isValidEventName('2025-13-10-Iceland')).toBe(false)
    expect(isValidEventName('2025-00-10-Iceland')).toBe(false)
    expect(isValidEventName('2025-05-32-Iceland')).toBe(false)
    expect(isValidEventName('2025-05-00-Iceland')).toBe(false)
  })

  test('rejects a day that does not exist in that month (T5)', () => {
    expect(isValidEventName('2025-02-30-Iceland')).toBe(false)
    expect(isValidEventName('2025-11-31-Iceland')).toBe(false)
    expect(isValidEventName('2025-02-29-Iceland')).toBe(false)
  })

  test('accepts February 29 in a leap year', () => {
    expect(isValidEventName('2024-02-29-Iceland')).toBe(true)
  })
})

describe('isRealDate', () => {
  test('accepts an ordinary date', () => {
    expect(isRealDate(2025, 5, 10)).toBe(true)
  })

  test('rejects a rolled-over date', () => {
    expect(isRealDate(2025, 2, 30)).toBe(false)
    expect(isRealDate(2025, 11, 31)).toBe(false)
  })

  test('knows which years are leap years', () => {
    expect(isRealDate(2024, 2, 29)).toBe(true)
    expect(isRealDate(2100, 2, 29)).toBe(false)
    expect(isRealDate(2000, 2, 29)).toBe(true)
  })

  test('rejects out-of-range fields', () => {
    expect(isRealDate(2025, 0, 10)).toBe(false)
    expect(isRealDate(2025, 13, 10)).toBe(false)
    expect(isRealDate(2025, 5, 0)).toBe(false)
    expect(isRealDate(2025, 5, 32)).toBe(false)
  })
})

describe('isValidSourceSegment', () => {
  test('accepts a plain segment', () => {
    expect(isValidSourceSegment('dji')).toBe(true)
    expect(isValidSourceSegment('iphone-aline')).toBe(true)
    expect(isValidSourceSegment('nikon_z6')).toBe(true)
  })

  test('rejects anything containing a separator', () => {
    expect(isValidSourceSegment('a/b')).toBe(false)
    expect(isValidSourceSegment('a\\b')).toBe(false)
    expect(isValidSourceSegment('/dji')).toBe(false)
    expect(isValidSourceSegment('dji/')).toBe(false)
  })

  test('rejects traversal and dotfiles', () => {
    expect(isValidSourceSegment('..')).toBe(false)
    expect(isValidSourceSegment('.')).toBe(false)
    expect(isValidSourceSegment('.hidden')).toBe(false)
    expect(isValidSourceSegment('../escape')).toBe(false)
  })

  test('rejects empty and padded values', () => {
    expect(isValidSourceSegment('')).toBe(false)
    expect(isValidSourceSegment(' ')).toBe(false)
    expect(isValidSourceSegment(' dji')).toBe(false)
    expect(isValidSourceSegment('dji ')).toBe(false)
  })
})

describe('checkSourceLocation', () => {
  const root = '/Volumes/photos-archive'

  test('a source outside the archive is fine', () => {
    expect(checkSourceLocation('/Users/harold/Desktop/card', root)).toBeNull()
  })

  test('a to-sort folder inside the archive is fine — that is the point', () => {
    expect(checkSourceLocation(`${root}/to-sort`, root)).toBeNull()
    expect(checkSourceLocation(`${root}/to-sort/iceland`, root)).toBeNull()
  })

  test('the archive root itself is refused', () => {
    expect(checkSourceLocation(root, root)).toBe('is_archive_root')
    expect(checkSourceLocation(`${root}/`, root)).toBe('is_archive_root')
  })

  test('a managed folder is refused', () => {
    expect(checkSourceLocation(`${root}/events`, root)).toBe('inside_events')
    expect(checkSourceLocation(`${root}/events/2025-05-10-Iceland`, root)).toBe(
      'inside_events'
    )
    expect(checkSourceLocation(`${root}/sorted`, root)).toBe('inside_sorted')
    expect(checkSourceLocation(`${root}/sorted/2025/05`, root)).toBe(
      'inside_sorted'
    )
  })

  test('any raw_versions folder is refused, wherever it sits', () => {
    expect(checkSourceLocation(`${root}/to-sort/raw_versions`, root)).toBe(
      'inside_bucket'
    )
    expect(
      checkSourceLocation(`${root}/sorted/2025/05/raw_versions`, root)
    ).toBe('inside_bucket')
  })

  test('a sibling path that merely shares a prefix is not "inside"', () => {
    // /Volumes/photos-archive-old is NOT under /Volumes/photos-archive.
    expect(checkSourceLocation('/Volumes/photos-archive-old', root)).toBeNull()
  })

  test('a folder merely ending in a managed name is fine', () => {
    expect(checkSourceLocation(`${root}/my-events`, root)).toBeNull()
    expect(
      checkSourceLocation(`${root}/to-sort/footage_raw_versions`, root)
    ).toBeNull()
  })
})
