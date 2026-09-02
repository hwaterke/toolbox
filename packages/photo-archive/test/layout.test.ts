import {describe, expect, test} from 'vitest'
import {resolveDestination} from '../src/lib/layout.ts'

const base = {year: '2025', month: '05'}
const photo = {...base, isRaw: false, hasPair: false}
const pairedRaw = {...base, isRaw: true, hasPair: true}
const loneRaw = {...base, isRaw: true, hasPair: false}

describe('sorted mode — no flags', () => {
  test('a photo goes to sorted/YYYY/MM', () => {
    expect(resolveDestination(photo)).toBe('sorted/2025/05')
  })

  test('a paired RAW goes to the raw_versions bucket', () => {
    expect(resolveDestination(pairedRaw)).toBe('sorted/2025/05/raw_versions')
  })

  test('a lone RAW stays in the normal folder so Immich indexes it', () => {
    expect(resolveDestination(loneRaw)).toBe('sorted/2025/05')
  })
})

describe('event mode — --event only', () => {
  const event = '2025-05-10-Iceland'

  test('a photo goes to events/N/footage', () => {
    expect(resolveDestination({...photo, event})).toBe(
      'events/2025-05-10-Iceland/footage'
    )
  })

  test('a paired RAW goes to events/N/footage/raw_versions', () => {
    expect(resolveDestination({...pairedRaw, event})).toBe(
      'events/2025-05-10-Iceland/footage/raw_versions'
    )
  })

  test('a lone RAW stays in footage', () => {
    expect(resolveDestination({...loneRaw, event})).toBe(
      'events/2025-05-10-Iceland/footage'
    )
  })

  test('the date is ignored once an event is given', () => {
    expect(
      resolveDestination({...photo, year: '1999', month: '12', event})
    ).toBe('events/2025-05-10-Iceland/footage')
  })
})

describe('grouped event mode — --event with --source', () => {
  const event = '2025-05-10-Iceland'
  const source = 'dji'

  test('a photo goes to events/N/footage/S', () => {
    expect(resolveDestination({...photo, event, source})).toBe(
      'events/2025-05-10-Iceland/footage/dji'
    )
  })

  test('a paired RAW goes to events/N/footage/raw_versions/S', () => {
    expect(resolveDestination({...pairedRaw, event, source})).toBe(
      'events/2025-05-10-Iceland/footage/raw_versions/dji'
    )
  })

  test('a lone RAW stays in the source folder', () => {
    expect(resolveDestination({...loneRaw, event, source})).toBe(
      'events/2025-05-10-Iceland/footage/dji'
    )
  })
})

describe('guards', () => {
  test('--source without --event is a programming error', () => {
    expect(() => resolveDestination({...photo, source: 'dji'})).toThrow(
      /requires/
    )
  })

  test('a non-RAW is never bucketed, even when it has a twin', () => {
    expect(resolveDestination({...photo, hasPair: true})).toBe('sorted/2025/05')
  })

  test('the month is used verbatim, zero-padded', () => {
    expect(resolveDestination({...photo, month: '01'})).toBe('sorted/2025/01')
    expect(resolveDestination({...photo, month: '12'})).toBe('sorted/2025/12')
  })
})
