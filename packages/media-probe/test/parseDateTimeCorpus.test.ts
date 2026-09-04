import {describe, expect, test} from 'vitest'
import {readFileSync} from 'node:fs'
import nodePath from 'node:path'
import {Temporal} from 'temporal-polyfill'
import {ExiftoolService, toExifIso} from '../src/ExiftoolService.ts'

/**
 * Pins the EXIF parse layer to a generated corpus - every shape the six
 * regexes accept, crossed with a spread of dates and zones, plus strings they
 * must reject.
 *
 * The expected answers live in `test/fixtures/parse-corpus.json`. They were
 * produced by running luxon and Temporal side by side during the migration
 * away from luxon; every entry the two libraries agreed on is an unchanged
 * behaviour, and the handful carrying a `luxon` field are the deliberate
 * changes, listed again in `differ only on repeated wall clocks` below.
 *
 * The file is frozen. Do not regenerate it to make a failure go away - a diff
 * here is a behaviour change, and it needs a reason.
 */

const SNAPSHOT_PATH = nodePath.join(
  import.meta.dirname,
  'fixtures',
  'parse-corpus.json'
)

// ---------------------------------------------------------------- the corpus

/** Zones that behave differently: whole hours, half hours, and 30-minute DST. */
const ZONES = [
  undefined,
  'utc',
  'Europe/Brussels',
  'Europe/London',
  'Asia/Kolkata',
  'Australia/Lord_Howe',
  'America/New_York',
  'Pacific/Auckland',
] as const

/** Local wall-clock times, as `yyyy:MM:dd HH:mm:ss`. */
const WALL_CLOCKS = [
  '2024:04:06 18:51:45',
  // Midnight and the last second of a day.
  '2024:01:01 00:00:00',
  '2024:12:31 23:59:59',
  // Leap day.
  '2024:02:29 12:00:00',
  // Brussels loses 02:00-03:00 here; the wall clock does not exist.
  '2024:03:31 02:30:00',
  // Brussels repeats 02:00-03:00 here; the wall clock happens twice.
  '2024:10:27 02:30:00',
  // The same two boundaries in the southern hemisphere and in Lord Howe,
  // whose DST step is 30 minutes.
  '2024:04:07 02:30:00',
  '2024:10:06 02:30:00',
  // United States boundaries, which fall on different dates.
  '2024:03:10 02:30:00',
  '2024:11:03 01:30:00',
  // Well before the zone database settles down.
  '1970:01:01 00:00:00',
] as const

/** Offsets the EXIF shapes with a timezone can carry. */
const OFFSETS = ['+00:00', '-00:00', '+02:00', '-05:00', '+05:30', '+14:00']

const SUBSEC_HUNDREDTHS = ['00', '04', '76', '99']
const SUBSEC_MILLIS = ['000', '007', '045', '760', '999']

type Case = {
  /** The string exiftool would print. */
  date: string
  /** The `fallbackTimeZone` the caller passes, if any. */
  zone: string | undefined
  /** Which of the six regexes this string is meant to hit. */
  shape: string
}

const buildCorpus = (): Case[] => {
  const cases: Case[] = []

  for (const clock of WALL_CLOCKS) {
    for (const zone of ZONES) {
      // Shapes with no offset of their own fall back to the caller's zone.
      cases.push({date: clock, zone, shape: 'plain'})
      cases.push({date: `${clock}Z`, zone, shape: 'utc'})
      for (const hundredths of SUBSEC_HUNDREDTHS) {
        cases.push({date: `${clock}.${hundredths}`, zone, shape: 'subsec'})
      }
    }

    // Shapes that carry their own offset ignore the caller's zone, so they
    // are generated once each rather than once per zone.
    for (const offset of OFFSETS) {
      cases.push({date: `${clock}${offset}`, zone: undefined, shape: 'tz'})
      for (const hundredths of SUBSEC_HUNDREDTHS) {
        cases.push({
          date: `${clock}.${hundredths}${offset}`,
          zone: undefined,
          shape: 'subsec2-tz',
        })
      }
      for (const millis of SUBSEC_MILLIS) {
        cases.push({
          date: `${clock}.${millis}${offset}`,
          zone: undefined,
          shape: 'subsec3-tz',
        })
      }
    }
  }

  // Strings none of the six regexes accept.
  for (const date of [
    '',
    'unknown',
    '0000:00:00 00:00:00',
    '2024-04-06 18:51:45',
    '2024:04:06T18:51:45',
    '2024:04:06 18:51',
    '2024:04:06 18:51:45.7',
    '2024:04:06 18:51:45.7654',
    '2024:04:06 18:51:45+0200',
    '2024:04:06 18:51:45 +02:00',
    '2024:04:06 18:51:45z',
  ]) {
    cases.push({date, zone: undefined, shape: 'rejected'})
    cases.push({date, zone: 'Europe/Brussels', shape: 'rejected'})
  }

  return cases
}

// ------------------------------------------------------------- the parse call

const service = new ExiftoolService({})

const parseWithTemporal = (testCase: Case): string | null => {
  const parsed = (
    service as unknown as {
      parseDateTime: (arg: {
        date: string
        fallbackTimeZone?: string
      }) => Temporal.ZonedDateTime | null
    }
  ).parseDateTime({date: testCase.date, fallbackTimeZone: testCase.zone})

  return parsed === null ? null : toExifIso(parsed)
}

// ------------------------------------------------------------------ the tests

/**
 * One corpus entry. `iso` is what the parse layer must return. `luxon` is
 * filled in only where the library this code replaced answered differently,
 * so the file lists every deliberate behaviour change in one place.
 */
type Frozen = {
  date: string
  zone: string | null
  iso: string | null
  luxon?: string | null
}

const CORPUS = buildCorpus()
const FROZEN: Frozen[] = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))

describe('the parse corpus', () => {
  test('the machine zone is pinned, so the corpus is reproducible', () => {
    expect(Temporal.Now.timeZoneId()).toBe('Europe/Brussels')
  })

  test('covers every shape the six regexes accept, and some they do not', () => {
    const shapes = new Set(CORPUS.map((testCase) => testCase.shape))
    expect([...shapes].sort()).toEqual([
      'plain',
      'rejected',
      'subsec',
      'subsec2-tz',
      'subsec3-tz',
      'tz',
      'utc',
    ])
    expect(CORPUS.length).toBeGreaterThan(1000)
  })

  test('the frozen file still lines up with the generated corpus', () => {
    expect(FROZEN.length).toBe(CORPUS.length)
    expect(FROZEN.map((entry) => entry.date)).toEqual(
      CORPUS.map((testCase) => testCase.date)
    )
    expect(FROZEN.map((entry) => entry.zone)).toEqual(
      CORPUS.map((testCase) => testCase.zone ?? null)
    )
  })

  // A corpus that parsed nothing would pass every other test here.
  test('most of the corpus actually parses', () => {
    const parsed = FROZEN.filter((entry) => entry.iso !== null)
    expect(parsed.length).toBeGreaterThan(CORPUS.length * 0.9)
  })

  test('the shapes that should be rejected all are', () => {
    const rejected = CORPUS.map((testCase, index) => ({
      testCase,
      iso: FROZEN[index]!.iso,
    })).filter(({testCase}) => testCase.shape === 'rejected')

    expect(rejected.length).toBeGreaterThan(0)
    for (const {testCase, iso} of rejected) {
      expect(iso, `${testCase.date} should not parse`).toBeNull()
    }
  })
})

describe('the frozen answers', () => {
  test('the parse layer produces them', () => {
    const actual = CORPUS.map(parseWithTemporal)
    expect(actual).toEqual(FROZEN.map((entry) => entry.iso))
  })

  test('almost none of the corpus is flagged as a behaviour change', () => {
    const unflagged = FROZEN.filter((entry) => !('luxon' in entry))
    expect(unflagged.length).toBeGreaterThan(CORPUS.length * 0.9)
  })

  /**
   * The one accepted behaviour change. When a wall clock happens twice - the
   * hour DST gives back - Temporal takes the first occurrence. luxon took
   * the second, but only in zones far enough east that its guess-and-correct
   * maths landed on the far side of the transition; Europe and the Americas
   * came out the same. The wall clock is identical either way, so filenames
   * do not move; only the offset written into EXIF does.
   */
  test('differ from luxon only on repeated wall clocks in far-east zones', () => {
    const flagged = FROZEN.filter((entry) => 'luxon' in entry)

    expect(
      flagged.map((entry) => ({
        date: entry.date,
        zone: entry.zone,
        luxon: entry.luxon,
        temporal: entry.iso,
      }))
    ).toMatchInlineSnapshot(`
      [
        {
          "date": "2024:04:07 02:30:00",
          "luxon": "2024-04-07T02:30:00.000+12:00",
          "temporal": "2024-04-07T02:30:00.000+13:00",
          "zone": "Pacific/Auckland",
        },
        {
          "date": "2024:04:07 02:30:00.00",
          "luxon": "2024-04-07T02:30:00.000+12:00",
          "temporal": "2024-04-07T02:30:00.000+13:00",
          "zone": "Pacific/Auckland",
        },
        {
          "date": "2024:04:07 02:30:00.04",
          "luxon": "2024-04-07T02:30:00.040+12:00",
          "temporal": "2024-04-07T02:30:00.040+13:00",
          "zone": "Pacific/Auckland",
        },
        {
          "date": "2024:04:07 02:30:00.76",
          "luxon": "2024-04-07T02:30:00.760+12:00",
          "temporal": "2024-04-07T02:30:00.760+13:00",
          "zone": "Pacific/Auckland",
        },
        {
          "date": "2024:04:07 02:30:00.99",
          "luxon": "2024-04-07T02:30:00.990+12:00",
          "temporal": "2024-04-07T02:30:00.990+13:00",
          "zone": "Pacific/Auckland",
        },
      ]
    `)
  })
})
