import {describe, expect, test} from 'vitest'
import {closestMatch} from '../src/closestMatch.ts'

describe('closestMatch', () => {
  test('finds a one-character typo', () => {
    expect(closestMatch('2025-05-10-Icelnd', ['2025-05-10-Iceland'])).toBe(
      '2025-05-10-Iceland'
    )
  })

  test('ignores case', () => {
    expect(closestMatch('2025-05-10-iceland', ['2025-05-10-Iceland'])).toBe(
      '2025-05-10-Iceland'
    )
  })

  test('returns null when nothing is close', () => {
    expect(closestMatch('2025-05-10-Iceland', ['1999-01-01-Xyz'])).toBeNull()
  })

  test('returns null for an empty archive', () => {
    expect(closestMatch('2025-05-10-Iceland', [])).toBeNull()
  })
})
