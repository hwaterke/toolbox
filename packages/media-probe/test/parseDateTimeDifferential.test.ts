import {beforeAll, describe, expect, test} from 'vitest'
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import nodePath from 'node:path'
import {DateTime} from 'luxon'
import {Temporal} from 'temporal-polyfill'
import {ExiftoolService} from '../src/ExiftoolService.ts'

/**
 * TEMPORARY (deleted in step 3.1 of LUXON-TO-TEMPORAL.md).
 *
 * Runs the luxon parse layer and a Temporal replacement side by side over a
 * generated corpus - every EXIF shape the six regexes accept, crossed with a
 * spread of dates and zones - and asserts the two agree on every one.
 *
 * The agreed answers are frozen into `test/fixtures/parse-corpus.json`, which
 * outlives this file: once luxon is gone the frozen corpus is what keeps the
 * Temporal implementation honest.
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

// ------------------------------------------------------------ the two parsers

const service = new ExiftoolService({})

/**
 * What ships today. `parseDateTime` is private, so it is reached by index;
 * this file is deleted before that matters.
 */
const parseWithLuxon = (testCase: Case): string | null => {
  const parsed = (
    service as unknown as {
      parseDateTime: (arg: {
        date: string
        fallbackTimeZone?: string
      }) => DateTime | null
    }
  ).parseDateTime({date: testCase.date, fallbackTimeZone: testCase.zone})

  return parsed && parsed.isValid ? parsed.toISO() : null
}

const EXIF_DATE_TIME_REGEX = /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/
const EXIF_DATE_TIME_WITH_TZ_REGEX =
  /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/
const EXIF_DATE_TIME_WITH_UTC_REGEX = /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}Z$/
const EXIF_DATE_TIME_SUBSEC_REGEX =
  /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}\.\d{2}$/
const EXIF_DATE_TIME_SUBSEC2_WITH_TZ_REGEX =
  /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}\.\d{2}[+-]\d{2}:\d{2}$/
const EXIF_DATE_TIME_SUBSEC3_WITH_TZ_REGEX =
  /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/

/** `2024:04:06 18:51:45` -> `2024-04-06T18:51:45`. */
const toIsoShape = (date: string): string =>
  `${date.slice(0, 10).replaceAll(':', '-')}T${date.slice(11)}`

/**
 * luxon prints `Z` rather than `+00:00`, but only when the zone itself is
 * UTC or a zero fixed offset. A named zone sitting at +00:00 - London in
 * winter - still prints `+00:00`, in both libraries.
 */
const render = (zoned: Temporal.ZonedDateTime): string => {
  const iso = zoned.toString({
    fractionalSecondDigits: 3,
    timeZoneName: 'never',
  })
  const id = zoned.timeZoneId
  return id === 'UTC' || /^[+-]00:00$/.test(id)
    ? iso.replace(/[+-]00:00$/, 'Z')
    : iso
}

/** The proposed replacement, kept behind the same six regexes. */
const parseWithTemporal = (testCase: Case): string | null => {
  const {date} = testCase
  const zone = testCase.zone ?? Temporal.Now.timeZoneId()

  const from = (text: string): string | null => {
    try {
      return render(Temporal.ZonedDateTime.from(text))
    } catch {
      return null
    }
  }

  if (EXIF_DATE_TIME_SUBSEC3_WITH_TZ_REGEX.test(date)) {
    const offset = date.slice(-6)
    return from(`${toIsoShape(date)}[${offset}]`)
  }
  if (EXIF_DATE_TIME_SUBSEC2_WITH_TZ_REGEX.test(date)) {
    const offset = date.slice(-6)
    return from(`${toIsoShape(date)}[${offset}]`)
  }
  if (EXIF_DATE_TIME_SUBSEC_REGEX.test(date)) {
    return from(`${toIsoShape(date)}[${zone}]`)
  }
  if (EXIF_DATE_TIME_WITH_TZ_REGEX.test(date)) {
    const offset = date.slice(-6)
    return from(`${toIsoShape(date)}[${offset}]`)
  }
  if (EXIF_DATE_TIME_WITH_UTC_REGEX.test(date)) {
    return from(`${toIsoShape(date.slice(0, -1))}[UTC]`)
  }
  if (EXIF_DATE_TIME_REGEX.test(date)) {
    return from(`${toIsoShape(date)}[${zone}]`)
  }
  return null
}

// ------------------------------------------------------------------ the tests

/**
 * One corpus entry. `iso` is the answer going forward - Temporal's. `luxon`
 * is filled in only where the old library answered differently, so the file
 * lists every deliberate behaviour change in one place.
 */
type Frozen = {
  date: string
  zone: string | null
  iso: string | null
  luxon?: string | null
}

const CORPUS = buildCorpus()

let frozen: Frozen[]

beforeAll(() => {
  if (!existsSync(SNAPSHOT_PATH)) {
    mkdirSync(nodePath.dirname(SNAPSHOT_PATH), {recursive: true})
    const generated: Frozen[] = CORPUS.map((testCase) => {
      const temporal = parseWithTemporal(testCase)
      const luxon = parseWithLuxon(testCase)
      return {
        date: testCase.date,
        zone: testCase.zone ?? null,
        iso: temporal,
        ...(luxon === temporal ? {} : {luxon}),
      }
    })
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(generated, null, 2)}\n`)
  }
  frozen = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))
})

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
    expect(frozen.length).toBe(CORPUS.length)
    expect(frozen.map((entry) => entry.date)).toEqual(
      CORPUS.map((testCase) => testCase.date)
    )
    expect(frozen.map((entry) => entry.zone)).toEqual(
      CORPUS.map((testCase) => testCase.zone ?? null)
    )
  })

  // A corpus that parsed nothing would pass every other test here.
  test('most of the corpus actually parses', () => {
    const parsed = frozen.filter((entry) => entry.iso !== null)
    expect(parsed.length).toBeGreaterThan(CORPUS.length * 0.9)
  })

  test('the shapes that should be rejected all are', () => {
    const rejected = CORPUS.map((testCase, index) => ({
      testCase,
      iso: frozen[index]!.iso,
    })).filter(({testCase}) => testCase.shape === 'rejected')

    expect(rejected.length).toBeGreaterThan(0)
    for (const {testCase, iso} of rejected) {
      expect(iso, `${testCase.date} should not parse`).toBeNull()
    }
  })
})

describe('luxon and Temporal', () => {
  test('agree on every case the frozen file does not flag', () => {
    const unflagged = CORPUS.filter((_, index) => !('luxon' in frozen[index]!))

    const disagreements = unflagged
      .map((testCase) => ({
        date: testCase.date,
        zone: testCase.zone,
        luxon: parseWithLuxon(testCase),
        temporal: parseWithTemporal(testCase),
      }))
      .filter((entry) => entry.luxon !== entry.temporal)

    expect(disagreements).toEqual([])
    expect(unflagged.length).toBeGreaterThan(CORPUS.length * 0.9)
  })

  /**
   * The one accepted behaviour change. When a wall clock happens twice - the
   * hour DST gives back - Temporal takes the first occurrence. luxon takes
   * the second, but only in zones far enough east that its guess-and-correct
   * maths lands on the far side of the transition; Europe and the Americas
   * come out the same. The wall clock is identical either way, so filenames
   * do not move; only the offset written into EXIF does.
   */
  test('differ only on repeated wall clocks in far-east zones', () => {
    const flagged = CORPUS.map((testCase, index) => ({
      testCase,
      entry: frozen[index]!,
    })).filter(({entry}) => 'luxon' in entry)

    expect(
      flagged.map(({testCase, entry}) => ({
        date: testCase.date,
        zone: testCase.zone ?? null,
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

describe('the frozen answers', () => {
  test('Temporal produces them', () => {
    const actual = CORPUS.map(parseWithTemporal)
    expect(actual).toEqual(frozen.map((entry) => entry.iso))
  })

  test('luxon produces them wherever it is not flagged as differing', () => {
    const expected = frozen.map((entry) =>
      'luxon' in entry ? entry.luxon : entry.iso
    )
    expect(CORPUS.map(parseWithLuxon)).toEqual(expected)
  })
})
