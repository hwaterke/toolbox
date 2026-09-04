import {describe, expect, test} from 'vitest'
import {
  DIFFERENCE_THRESHOLD_SECONDS,
  hourDifference,
} from '../src/lib/hourShift.ts'

/**
 * Characterisation tests: they record the hour-shift maths lifted out of
 * `dji-shift.ts` - the rounding to whole hours, the 45-second threshold, and
 * the zero case. Everything here is plain milliseconds, so none of it moves
 * when luxon does.
 */

const HOUR = 3_600_000

/** A metadata clock `hours` ahead of the recording start, plus `offMs` of slop. */
const shifted = ({
  hours,
  offMs = 0,
  durationSeconds = 0,
}: {
  hours: number
  offMs?: number
  durationSeconds?: number
}) => {
  const fileTimeMs = Date.UTC(2024, 3, 6, 18, 51, 45)
  return {
    metadataTimeMs: fileTimeMs - durationSeconds * 1000 + hours * HOUR + offMs,
    fileTimeMs,
    durationSeconds,
  }
}

describe('hourDifference', () => {
  describe('whole hours', () => {
    test.for([-2, -1, 0, 1, 2, 5] as const)('%d hours out', (hours) => {
      expect(hourDifference(shifted({hours}))).toBe(hours)
    })

    // The clocks agreeing exactly is not an error, it is a zero shift.
    test('two clocks that match give 0', () => {
      const fileTimeMs = Date.UTC(2024, 3, 6, 18, 51, 45)
      expect(
        hourDifference({
          metadataTimeMs: fileTimeMs,
          fileTimeMs,
          durationSeconds: 0,
        })
      ).toBe(0)
    })
  })

  describe('the recording duration', () => {
    // The file time is written when recording stops, so the video started
    // `durationSeconds` earlier. That is what the metadata time is compared to.
    test('a long clip with a matching metadata time still gives 0', () => {
      expect(hourDifference(shifted({hours: 0, durationSeconds: 600}))).toBe(0)
    })

    test('the duration does not eat into the hour count', () => {
      expect(hourDifference(shifted({hours: 2, durationSeconds: 600}))).toBe(2)
    })

    // Without the duration the same numbers would be 10 minutes off an hour,
    // which is well past the threshold.
    test('ignoring the duration would throw', () => {
      const {metadataTimeMs, fileTimeMs} = shifted({
        hours: 2,
        durationSeconds: 600,
      })
      expect(() =>
        hourDifference({metadataTimeMs, fileTimeMs, durationSeconds: 0})
      ).toThrow('Difference is too large')
    })
  })

  describe('rounding to the nearest hour', () => {
    test.for([
      // Slop in milliseconds, and the hour count it still rounds to.
      [30_000, 1],
      [-30_000, 1],
      [45_000, 1],
      [-45_000, 1],
      [1, 1],
      [-1, 1],
    ] as const)('%d ms of slop still reads as %d hours', ([offMs, hours]) => {
      expect(hourDifference(shifted({hours: 1, offMs}))).toBe(hours)
    })

    test('slop is measured against the nearest hour, not the lower one', () => {
      expect(hourDifference(shifted({hours: -3, offMs: 44_000}))).toBe(-3)
    })
  })

  describe('the 45-second threshold', () => {
    test('exactly 45 seconds of slop is accepted', () => {
      expect(DIFFERENCE_THRESHOLD_SECONDS).toBe(45)
      expect(hourDifference(shifted({hours: 1, offMs: 45_000}))).toBe(1)
    })

    test.for([45_001, -45_001, 60_000, -600_000, 1_800_000] as const)(
      '%d ms of slop throws',
      (offMs) => {
        expect(() => hourDifference(shifted({hours: 1, offMs}))).toThrow(
          'Difference is too large'
        )
      }
    )

    test('the message names the leftover seconds', () => {
      expect(() => hourDifference(shifted({hours: 1, offMs: 90_000}))).toThrow(
        'Difference is too large: 90 seconds. Please check the file time manually.'
      )
    })

    // Half an hour is the worst case: it rounds either way and is always
    // 1800 seconds from the nearest hour.
    test('half an hour out is never accepted', () => {
      expect(() =>
        hourDifference(shifted({hours: 0, offMs: 1_800_000}))
      ).toThrow('Difference is too large: 1800 seconds')
    })
  })
})
