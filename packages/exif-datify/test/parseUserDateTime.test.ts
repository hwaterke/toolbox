import {describe, expect, test} from 'vitest'
import {Temporal} from 'temporal-polyfill'
import {parseUserDateTime} from '../src/lib/exifTime.ts'

/**
 * What `set-date -t` accepts. `Temporal.ZonedDateTime.from` refuses a bare
 * offset ISO - it wants a `[zone]` bracket, so `2024-04-03T10:01:22+02:00`
 * throws until `[+02:00]` is appended. These record that the command still
 * takes everything a user could reasonably type.
 */

const local = Temporal.Now.timeZoneId()

const parsed = (text: string) => parseUserDateTime(text)?.toString() ?? null

describe('parseUserDateTime', () => {
  test('a bare offset ISO keeps that offset as its zone', () => {
    expect(parsed('2024-04-03T10:01:22+02:00')).toBe(
      '2024-04-03T10:01:22+02:00[+02:00]'
    )
    expect(parsed('2024-04-03T10:01:22-05:00')).toBe(
      '2024-04-03T10:01:22-05:00[-05:00]'
    )
  })

  test('shorter offset spellings work too', () => {
    expect(parsed('2024-04-03T10:01:22+0200')).toBe(
      '2024-04-03T10:01:22+02:00[+02:00]'
    )
    expect(parsed('2024-04-03T10:01:22+02')).toBe(
      '2024-04-03T10:01:22+02:00[+02:00]'
    )
  })

  test('a trailing Z is UTC', () => {
    expect(parsed('2024-04-03T10:01:22Z')).toBe(
      '2024-04-03T10:01:22+00:00[UTC]'
    )
  })

  test('sub-seconds survive', () => {
    expect(parsed('2024-04-03T10:01:22.760+02:00')).toBe(
      '2024-04-03T10:01:22.76+02:00[+02:00]'
    )
  })

  test('a naked local time takes the machine zone', () => {
    const result = parseUserDateTime('2024-04-03T10:01:22')
    expect(result?.timeZoneId).toBe(local)
    expect(result?.toPlainDateTime().toString()).toBe('2024-04-03T10:01:22')
  })

  // `2024-04-03` ends in `-03`, which must not be read as an offset.
  test('a date on its own is local midnight, not an offset', () => {
    const result = parseUserDateTime('2024-04-03')
    expect(result?.timeZoneId).toBe(local)
    expect(result?.toPlainDateTime().toString()).toBe('2024-04-03T00:00:00')
  })

  test('an explicit zone in brackets is honoured', () => {
    expect(parsed('2024-04-03T10:01:22[Europe/Brussels]')).toBe(
      '2024-04-03T10:01:22+02:00[Europe/Brussels]'
    )
  })

  test('surrounding spaces are ignored', () => {
    expect(parsed('  2024-04-03T10:01:22Z  ')).toBe(
      '2024-04-03T10:01:22+00:00[UTC]'
    )
  })

  test('unreadable input returns null, so the command can report it', () => {
    for (const text of [
      '',
      'not a date',
      '2024-13-03T10:01:22',
      '2024-04-03T25:01:22',
      '03/04/2024',
      '2024-04-03T10:01:22[Nowhere/Special]',
    ]) {
      expect(parseUserDateTime(text), text).toBeNull()
    }
  })
})
