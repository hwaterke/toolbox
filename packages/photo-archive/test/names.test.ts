import {describe, expect, test} from 'vitest'
import {parseTimestampedName} from '../src/lib/names.ts'

describe('parseTimestampedName', () => {
  test('extracts the trailing token', () => {
    expect(parseTimestampedName('2025-05-10_15-08-02_DJI_0173')?.token).toBe(
      'DJI_0173'
    )
  })

  test('a token containing underscores survives intact', () => {
    expect(
      parseTimestampedName('2025-01-02_03-04-05_IMG_1234_icloud-papa')?.token
    ).toBe('IMG_1234_icloud-papa')
  })

  test('epoch seconds are one apart for stamps one second apart', () => {
    const a = parseTimestampedName('2025-05-10_15-08-02_DJI_0173')
    const b = parseTimestampedName('2025-05-10_15-08-01_DJI_0173')
    expect(a!.epochSeconds - b!.epochSeconds).toBe(1)
  })

  test('returns the zero-padded year and month for sorted/YYYY/MM', () => {
    const parsed = parseTimestampedName('2025-01-02_03-04-05_IMG_1234')
    expect(parsed).toMatchObject({year: '2025', month: '01'})
  })

  test('is timezone-independent: year and month come from the name', () => {
    // The stem is the only source of truth (decision 2), so a name minutes
    // before midnight on New Year's Eve still files under 2025/12.
    expect(parseTimestampedName('2025-12-31_23-59-59_IMG_1')).toMatchObject({
      year: '2025',
      month: '12',
    })
  })

  test('rejects a stem that is not timestamp-prefixed', () => {
    expect(parseTimestampedName('not-a-timestamp_DJI')).toBeNull()
    expect(parseTimestampedName('IMG_1234')).toBeNull()
  })

  test('rejects impossible dates and times', () => {
    expect(parseTimestampedName('2025-13-10_15-08-02_X')).toBeNull() // month 13
    expect(parseTimestampedName('2025-00-10_15-08-02_X')).toBeNull() // month 0
    expect(parseTimestampedName('2025-02-30_15-08-02_X')).toBeNull() // Feb 30
    expect(parseTimestampedName('2025-05-00_15-08-02_X')).toBeNull() // day 0
    expect(parseTimestampedName('2025-05-10_25-08-02_X')).toBeNull() // hour 25
    expect(parseTimestampedName('2025-05-10_15-60-02_X')).toBeNull() // minute 60
    expect(parseTimestampedName('2025-05-10_15-08-60_X')).toBeNull() // second 60
  })

  test('rejects an empty token', () => {
    expect(parseTimestampedName('2025-05-10_15-08-02_')).toBeNull()
  })

  test('accepts a leap day', () => {
    expect(parseTimestampedName('2024-02-29_12-00-00_X')).not.toBeNull()
    expect(parseTimestampedName('2025-02-29_12-00-00_X')).toBeNull()
  })
})
