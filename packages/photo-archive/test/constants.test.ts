import {describe, expect, test} from 'vitest'
import {
  BUCKET,
  MEDIA_EXTS,
  MEDIA_EXT_SET,
  PAIR_WINDOW_SECONDS,
  PANORAMA,
  PHOTO_EXTS,
  RAW_EXTS,
  RAW_EXT_SET,
  RESERVED_FOLDERS,
  SIDECAR_EXTS,
  SIDECAR_EXT_SET,
} from '../src/lib/constants.ts'

describe('MEDIA_EXTS', () => {
  test('is exactly the list from decision 10', () => {
    expect([...MEDIA_EXTS].sort()).toEqual(
      [
        'jpg',
        'jpeg',
        'heic',
        'png',
        'tif',
        'mov',
        'mp4',
        'm4v',
        'mpg',
        'mts',
        'avi',
        'wmv',
        'flv',
        '3gp',
        'nef',
        'dng',
        'srt',
      ].sort()
    )
  })

  test('contains no duplicates', () => {
    expect(MEDIA_EXT_SET.size).toBe(MEDIA_EXTS.length)
  })

  test('covers every RAW and photo extension', () => {
    for (const ext of [...RAW_EXTS, ...PHOTO_EXTS]) {
      expect(MEDIA_EXT_SET.has(ext)).toBe(true)
    }
  })

  test('excludes the sidecars decision 10 leaves behind', () => {
    for (const ext of ['aae', 'xmp', 'json', 'thm', 'lrf']) {
      expect(MEDIA_EXT_SET.has(ext)).toBe(false)
    }
  })

  test('covers the legacy camcorder formats', () => {
    for (const ext of ['mpg', 'mts', 'avi']) {
      expect(MEDIA_EXT_SET.has(ext)).toBe(true)
    }
  })

  test('every entry is lowercase and carries no dot', () => {
    for (const ext of MEDIA_EXTS) {
      expect(ext).toBe(ext.toLowerCase())
      expect(ext.startsWith('.')).toBe(false)
    }
  })
})

describe('RAW and photo extensions', () => {
  test('are disjoint — nothing is both', () => {
    for (const ext of PHOTO_EXTS) {
      expect(RAW_EXT_SET.has(ext)).toBe(false)
    }
  })

  test('hold the expected values', () => {
    expect([...RAW_EXTS]).toEqual(['nef', 'dng'])
    expect([...PHOTO_EXTS]).toEqual(['jpg', 'jpeg', 'heic'])
  })
})

test('BUCKET is the raw_versions folder name', () => {
  expect(BUCKET).toBe('raw_versions')
})

describe('SIDECAR_EXTS', () => {
  test('holds the expected values', () => {
    expect([...SIDECAR_EXTS]).toEqual(['thm', 'xmp', 'aae'])
  })

  test('shares nothing with the media extensions', () => {
    for (const ext of SIDECAR_EXTS) {
      expect(MEDIA_EXT_SET.has(ext)).toBe(false)
    }
    expect(SIDECAR_EXT_SET.size).toBe(SIDECAR_EXTS.length)
  })
})

test('PANORAMA is the lowercase panorama folder name', () => {
  expect(PANORAMA).toBe('panorama')
})

test('RESERVED_FOLDERS is exactly the bucket and panorama', () => {
  expect([...RESERVED_FOLDERS].sort()).toEqual(['panorama', 'raw_versions'])
})

test('PAIR_WINDOW_SECONDS is 5', () => {
  expect(PAIR_WINDOW_SECONDS).toBe(5)
})
