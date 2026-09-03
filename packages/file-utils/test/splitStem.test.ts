import {describe, expect, test} from 'vitest'
import {splitStem} from '../src/splitStem.ts'

describe('splitStem', () => {
  test('splits on the last dot and lowercases the extension', () => {
    expect(splitStem('a.JPG')).toEqual({stem: 'a', ext: 'jpg'})
    expect(splitStem('2025-05-10_15-08-02_DJI_0173.DNG')).toEqual({
      stem: '2025-05-10_15-08-02_DJI_0173',
      ext: 'dng',
    })
    expect(splitStem('archive.tar.NEF')).toEqual({
      stem: 'archive.tar',
      ext: 'nef',
    })
  })

  test('keeps the whole name as the stem when there is no extension', () => {
    expect(splitStem('noext')).toEqual({stem: 'noext', ext: ''})
  })

  test('treats a leading-dot dotfile as all stem', () => {
    expect(splitStem('.DS_Store')).toEqual({stem: '.DS_Store', ext: ''})
  })
})
