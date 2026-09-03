import {describe, expect, test} from 'vitest'
import {
  scopeLabel,
  scopeTree,
  type MediaTree,
  type Scope,
} from '../src/lib/model.ts'

const emptyTree = (path: string): MediaTree => ({
  path,
  entries: [],
  folders: [],
  files: [],
})

const root: Scope = {kind: 'root', path: '/a', entries: []}
const sorted: Scope = {
  kind: 'sorted',
  year: null,
  path: '/a/sorted',
  entries: [],
  person: null,
}
const year: Scope = {
  kind: 'sorted',
  year: '2025',
  path: '/a/sorted/2025',
  entries: [],
  person: null,
}
const person: Scope = {
  kind: 'person',
  person: 'sarah',
  path: '/a/relations/sarah',
  entries: [],
}
const event: Scope = {
  kind: 'event',
  name: '2025-05-10-Iceland',
  path: '/a/events/2025-05-10-Iceland',
  entries: [],
  footage: emptyTree('/a/events/2025-05-10-Iceland/footage'),
  person: null,
}
const month: Scope = {
  kind: 'month',
  year: '2025',
  month: '05',
  path: '/a/sorted/2025/05',
  tree: emptyTree('/a/sorted/2025/05'),
  person: null,
}

describe('scopeTree', () => {
  test('an event carries its footage tree', () => {
    expect(scopeTree(event)?.path).toBe('/a/events/2025-05-10-Iceland/footage')
  })

  test('an event without footage carries no tree', () => {
    expect(scopeTree({...event, footage: null})).toBeNull()
  })

  test('a month carries its own tree', () => {
    expect(scopeTree(month)?.path).toBe('/a/sorted/2025/05')
  })

  test('the listing-only scopes carry no tree', () => {
    for (const scope of [root, sorted, year, person]) {
      expect(scopeTree(scope)).toBeNull()
    }
  })
})

describe('scopeLabel', () => {
  test('names every scope kind', () => {
    expect(scopeLabel(root)).toBe('archive root')
    expect(scopeLabel(sorted)).toBe('sorted')
    expect(scopeLabel(year)).toBe('sorted/2025')
    expect(scopeLabel(person)).toBe('relations/sarah')
    expect(scopeLabel(event)).toBe('2025-05-10-Iceland')
    expect(scopeLabel(month)).toBe('sorted/2025/05')
  })
})
