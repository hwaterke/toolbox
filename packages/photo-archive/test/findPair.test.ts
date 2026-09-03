import {describe, expect, test} from 'vitest'
import {PAIR_WINDOW_SECONDS} from '../src/lib/constants.ts'
import {findPair, type PairCandidate} from '../src/lib/findPair.ts'

/** Candidate files in one folder, the shape `findPair` now takes. */
const at =
  (folder: string) =>
  (...names: string[]): PairCandidate[] =>
    names.map((name) => ({name, path: `${folder}/${name}`}))

const FOOTAGE = '/archive/events/2025-05-10-Iceland/footage'

const inFootage = at(FOOTAGE)

/** The single candidate a result is expected to carry. */
const footage = (name: string): PairCandidate => ({
  name,
  path: `${FOOTAGE}/${name}`,
})

describe('findPair pass 1 — exact stem', () => {
  test('matches a DSLR JPG with the same stem', () => {
    expect(findPair('SHOT1.NEF', inFootage('SHOT1.JPG', 'SHOT1.NEF'))).toEqual({
      method: 'exact',
      photo: footage('SHOT1.JPG'),
    })
  })

  test('is case-insensitive on the extension, both ways', () => {
    expect(findPair('SHOT1.nef', inFootage('SHOT1.jpg'))).toEqual({
      method: 'exact',
      photo: footage('SHOT1.jpg'),
    })
    expect(findPair('SHOT1.NEF', inFootage('SHOT1.heic'))).toEqual({
      method: 'exact',
      photo: footage('SHOT1.heic'),
    })
  })

  test('is case-sensitive on the stem', () => {
    expect(findPair('SHOT1.NEF', inFootage('shot1.JPG'))).toBeNull()
  })

  test('does not pair a RAW with a sibling RAW of the same stem', () => {
    expect(findPair('SHOT1.NEF', inFootage('SHOT1.DNG'))).toBeNull()
  })
})

describe('findPair pass 2 — trailing token', () => {
  test('pairs the drone JPG/RAW ~1s offset', () => {
    expect(
      findPair(
        '2025-05-10_15-08-02_DJI_0173.DNG',
        inFootage(
          '2025-05-10_15-08-01_DJI_0173.JPG',
          '2025-05-10_15-08-02_DJI_0173.DNG'
        )
      )
    ).toEqual({
      method: 'pass2',
      photo: footage('2025-05-10_15-08-01_DJI_0173.JPG'),
    })
  })

  test('an exact match always wins over a pass-2 candidate', () => {
    expect(
      findPair(
        '2025-05-10_15-08-02_DJI_0173.DNG',
        inFootage(
          '2025-05-10_15-08-02_DJI_0173.JPG',
          '2025-05-10_15-08-01_DJI_0173.JPG'
        )
      )
    ).toEqual({
      method: 'exact',
      photo: footage('2025-05-10_15-08-02_DJI_0173.JPG'),
    })
  })

  test('a non-unique token out of window yields no pair', () => {
    // Many library files share the literal token `icloud-papa`, but none is
    // within PAIR_WINDOW_SECONDS of this RAW.
    expect(
      findPair(
        '2025-03-03_09-00-00_icloud-papa.DNG',
        inFootage(
          '2025-01-01_10-00-00_icloud-papa.JPG',
          '2025-06-15_14-00-00_icloud-papa.JPG'
        )
      )
    ).toBeNull()
  })

  test('two same-token photos within the window are ambiguous, never guessed', () => {
    const result = findPair(
      '2025-01-01_10-00-01_T.NEF',
      inFootage('2025-01-01_10-00-00_T.JPG', '2025-01-01_10-00-02_T.JPG')
    )
    expect(result).toEqual({
      method: 'ambiguous',
      candidates: [
        footage('2025-01-01_10-00-00_T.JPG'),
        footage('2025-01-01_10-00-02_T.JPG'),
      ],
    })
  })

  test('the window is inclusive at its edge and excludes one second past it', () => {
    expect(PAIR_WINDOW_SECONDS).toBe(5)
    expect(
      findPair(
        '2025-01-01_10-00-00_T.NEF',
        inFootage('2025-01-01_10-00-05_T.JPG')
      )
    ).toEqual({method: 'pass2', photo: footage('2025-01-01_10-00-05_T.JPG')})
    expect(
      findPair(
        '2025-01-01_10-00-00_T.NEF',
        inFootage('2025-01-01_10-00-06_T.JPG')
      )
    ).toBeNull()
  })

  test('the window applies in both directions', () => {
    expect(
      findPair(
        '2025-01-01_10-00-06_T.NEF',
        inFootage('2025-01-01_10-00-00_T.JPG')
      )
    ).toBeNull()
  })

  test('only viewable photos are considered, never sibling RAWs', () => {
    expect(
      findPair(
        '2025-01-01_10-00-00_T.DNG',
        inFootage('2025-01-01_10-00-01_T.NEF')
      )
    ).toBeNull()
  })

  test('a different token does not pair even at the same instant', () => {
    expect(
      findPair(
        '2025-01-01_10-00-00_A.DNG',
        inFootage('2025-01-01_10-00-00_B.JPG')
      )
    ).toBeNull()
  })

  test('a RAW without a timestamp prefix never reaches pass 2', () => {
    expect(
      findPair('DSC_0001.NEF', inFootage('2025-01-01_10-00-00_T.JPG'))
    ).toBeNull()
  })
})

describe('findPair reports where the twin was found', () => {
  test('the result carries the candidate folder, not just the name', () => {
    const bucket = at('/archive/events/2025-05-10-Iceland/footage/dji')
    expect(findPair('SHOT1.NEF', bucket('SHOT1.JPG'))).toEqual({
      method: 'exact',
      photo: {
        name: 'SHOT1.JPG',
        path: '/archive/events/2025-05-10-Iceland/footage/dji/SHOT1.JPG',
      },
    })
  })

  test('a folder containing a dot does not break matching (T2)', () => {
    const dotted = at('/archive/events/2025-05-10-St.Moritz/footage')
    expect(findPair('SHOT1.NEF', dotted('SHOT1.JPG'))).toEqual({
      method: 'exact',
      photo: {
        name: 'SHOT1.JPG',
        path: '/archive/events/2025-05-10-St.Moritz/footage/SHOT1.JPG',
      },
    })
  })
})

describe('findPair edge cases', () => {
  test('an empty listing yields no pair', () => {
    expect(findPair('SHOT1.NEF', [])).toBeNull()
  })

  test('a video sharing the token is not a pair', () => {
    expect(
      findPair(
        '2025-01-01_10-00-00_T.DNG',
        inFootage('2025-01-01_10-00-00_T.MP4')
      )
    ).toBeNull()
  })
})
