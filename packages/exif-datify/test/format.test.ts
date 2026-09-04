import {describe, expect, test} from 'vitest'
import {Temporal} from 'temporal-polyfill'
import {formatDateTime} from '../src/lib/format.ts'

const at = (text: string) => Temporal.ZonedDateTime.from(text)

/** 2024-04-06 18:51:45.760 in Brussels, i.e. +02:00. */
const BRUSSELS = at('2024-04-06T18:51:45.76+02:00[Europe/Brussels]')

describe('formatDateTime', () => {
  describe('the supported tokens', () => {
    test.each([
      ['yyyy', '2024'],
      ['MM', '04'],
      ['dd', '06'],
      ['HH', '18'],
      ['mm', '51'],
      ['ss', '45'],
      ['uu', '76'],
      ['SSS', '760'],
      ['ZZ', '+02:00'],
    ])('%s renders as %s', (format, expected) => {
      expect(formatDateTime(BRUSSELS, format)).toBe(expected)
    })

    test('the default --prefix format', () => {
      expect(formatDateTime(BRUSSELS, 'yyyy-MM-dd_HH-mm-ss_')).toBe(
        '2024-04-06_18-51-45_'
      )
    })

    test('every token at once', () => {
      expect(formatDateTime(BRUSSELS, 'yyyy:MM:dd HH:mm:ss.uu.SSSZZ')).toBe(
        '2024:04:06 18:51:45.76.760+02:00'
      )
    })
  })

  describe('padding', () => {
    test('single-digit parts are zero padded', () => {
      expect(
        formatDateTime(
          at('2024-01-02T03:04:05+01:00[Europe/Brussels]'),
          'yyyy-MM-dd HH:mm:ss'
        )
      ).toBe('2024-01-02 03:04:05')
    })

    test('years below 1000 are padded to four digits', () => {
      expect(formatDateTime(at('0007-01-01T00:00:00+00:00[UTC]'), 'yyyy')).toBe(
        '0007'
      )
    })
  })

  // T7 in LUXON-TO-TEMPORAL.md: luxon truncated, so this must too.
  describe('the uu sub-second token truncates, it does not round', () => {
    test.each([
      [0, '00'],
      [7, '00'],
      [45, '04'],
      [760, '76'],
      [999, '99'],
    ])('%d ms renders as %s', (millis, expected) => {
      const time = BRUSSELS.with({millisecond: millis, microsecond: 0})
      expect(formatDateTime(time, 'uu')).toBe(expected)
    })
  })

  describe('SSS keeps all three digits', () => {
    test.each([
      [0, '000'],
      [7, '007'],
      [45, '045'],
      [999, '999'],
    ])('%d ms renders as %s', (millis, expected) => {
      const time = BRUSSELS.with({millisecond: millis, microsecond: 0})
      expect(formatDateTime(time, 'SSS')).toBe(expected)
    })
  })

  describe('ZZ prints the offset the zone is at', () => {
    test.each([
      ['2024-04-06T18:51:45+02:00[Europe/Brussels]', '+02:00'],
      ['2024-01-06T18:51:45+01:00[Europe/Brussels]', '+01:00'],
      ['2024-04-06T18:51:45+00:00[UTC]', '+00:00'],
      ['2024-04-06T18:51:45+05:30[Asia/Kolkata]', '+05:30'],
      ['2024-04-06T18:51:45-04:00[America/New_York]', '-04:00'],
      ['2024-04-06T18:51:45+11:00[+11:00]', '+11:00'],
    ])('%s renders as %s', (text, expected) => {
      expect(formatDateTime(at(text), 'ZZ')).toBe(expected)
    })
  })

  describe('anything that is not a token is copied out as-is', () => {
    test('separators and empty formats', () => {
      expect(formatDateTime(BRUSSELS, '')).toBe('')
      expect(formatDateTime(BRUSSELS, '-_/. ')).toBe('-_/. ')
    })

    test('unsupported luxon tokens are literals, not an error', () => {
      // `EEEE`, `y` and `S` mean something to luxon; here they are text.
      expect(formatDateTime(BRUSSELS, 'EEEE')).toBe('EEEE')
      expect(formatDateTime(BRUSSELS, 'y S Z')).toBe('y S Z')
    })

    test('surrounding words survive', () => {
      expect(formatDateTime(BRUSSELS, 'shot on yyyy at HH')).toBe(
        'shot on 2024 at 18'
      )
    })

    test('tokens are matched greedily, longest first', () => {
      // luxon read a run of four `S` as literal text; here the first three are
      // the token and the fourth is a literal. No format in this repo uses a
      // repeated token, so the two never disagree in practice.
      expect(formatDateTime(BRUSSELS, 'SSSS')).toBe('760S')
    })
  })
})
