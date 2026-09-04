import {describe, expect, test} from 'vitest'
import {durationToSeconds} from '../src/lib/duration.ts'

describe('durationToSeconds', () => {
  describe('the short form exiftool uses under a minute', () => {
    // Real values, straight off the sample footage.
    test.for([
      ['3.64 s', 3.64],
      ['2.31 s', 2.31],
      ['1.63 s', 1.63],
    ] as const)('%s', ([input, expected]) => {
      expect(durationToSeconds(input)).toBeCloseTo(expected, 10)
    })

    test('reads the fraction as hundredths, not thousandths', () => {
      expect(durationToSeconds('1.50 s')).toBeCloseTo(1.5, 10)
    })

    test('keeps a leading zero in the fraction', () => {
      expect(durationToSeconds('9.05 s')).toBeCloseTo(9.05, 10)
    })

    test('accepts two whole-second digits', () => {
      expect(durationToSeconds('59.99 s')).toBeCloseTo(59.99, 10)
    })
  })

  describe('the clock form exiftool uses from a minute up', () => {
    test.for([
      ['0:00:23', 23],
      ['0:01:23', 83],
      ['1:00:00', 3600],
      ['2:03:04', 7384],
    ] as const)('%s', ([input, expected]) => {
      expect(durationToSeconds(input)).toBe(expected)
    })
  })

  describe('anything else', () => {
    test.for(['', '3.6 s', '3.640 s', '3.64s', '1:2:3', 'unknown'])(
      'rejects %o',
      (input) => {
        expect(() => durationToSeconds(input)).toThrow(
          `Invalid duration format ${input}`
        )
      }
    )
  })
})
