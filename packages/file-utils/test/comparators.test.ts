import {describe, expect, test} from 'vitest'
import {
  compareAsc,
  compareDesc,
  videosLastComparator,
} from '../src/walkFiles.js'

describe('compareAsc', () => {
  test('returns negative when a < b', () => {
    expect(compareAsc('a', 'b')).toBe(-1)
  })

  test('returns positive when a > b', () => {
    expect(compareAsc('b', 'a')).toBe(1)
  })

  test('returns 0 when equal', () => {
    expect(compareAsc('x', 'x')).toBe(0)
  })

  test('sorts an array lexicographically', () => {
    expect(['c', 'a', 'b'].slice().sort(compareAsc)).toEqual(['a', 'b', 'c'])
  })
})

describe('compareDesc', () => {
  test('is the inverse of compareAsc', () => {
    expect(compareDesc('a', 'b')).toBe(1)
    expect(compareDesc('b', 'a')).toBe(-1)
    expect(compareDesc('x', 'x')).toBeLessThanOrEqual(0)
    expect(compareDesc('x', 'x')).toBeGreaterThanOrEqual(0)
  })

  test('sorts an array lexicographically descending', () => {
    expect(['a', 'c', 'b'].slice().sort(compareDesc)).toEqual(['c', 'b', 'a'])
  })
})

describe('videosLastComparator', () => {
  test('pushes .mp4 files after non-video files', () => {
    expect(videosLastComparator('a.mp4', 'b.txt')).toBe(1)
    expect(videosLastComparator('b.txt', 'a.mp4')).toBe(-1)
  })

  test('treats .mov as a video', () => {
    expect(videosLastComparator('clip.mov', 'note.md')).toBe(1)
  })

  test('extension matching is case-insensitive', () => {
    expect(videosLastComparator('A.MP4', 'b.txt')).toBe(1)
    expect(videosLastComparator('A.MoV', 'b.txt')).toBe(1)
  })

  test('among non-videos, sorts by extension then by full path', () => {
    const files = ['z.txt', 'a.md', 'b.txt', 'a.txt']
    expect(files.slice().sort(videosLastComparator)).toEqual([
      'a.md',
      'a.txt',
      'b.txt',
      'z.txt',
    ])
  })

  test('among videos, sorts by extension then by full path', () => {
    const files = ['b.mp4', 'a.mov', 'a.mp4']
    expect(files.slice().sort(videosLastComparator)).toEqual([
      'a.mov',
      'a.mp4',
      'b.mp4',
    ])
  })

  test('full mixed sort: non-videos first, then videos', () => {
    const files = ['c.mp4', 'b.txt', 'a.mov', 'a.txt']
    expect(files.slice().sort(videosLastComparator)).toEqual([
      'a.txt',
      'b.txt',
      'a.mov',
      'c.mp4',
    ])
  })
})
