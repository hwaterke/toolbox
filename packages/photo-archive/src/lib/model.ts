/**
 * What `lint` judges: one folder's worth of the archive, materialised on its
 * own and dropped again before the next one (per-scope streaming). No scope
 * ever holds another scope's files, so peak memory is the largest single event,
 * not the archive.
 */

/** A direct child of a scope's folder. */
export type ScopeEntry = {
  name: string
  /** Absolute path. */
  path: string
  isDirectory: boolean
}

/** A folder somewhere below a media tree's root. */
export type ScopeFolder = {
  name: string
  /** Absolute path. */
  path: string
  /** Path below the tree root, `/`-separated. Never empty. */
  relativePath: string
  /** True for the reserved `panorama` folder, which is never descended (T3). */
  isPanorama: boolean
}

/** A file somewhere below a media tree's root. */
export type ScopeFile = {
  /** Filename with its extension. */
  name: string
  /** Absolute path. */
  path: string
  /** Path below the tree root, `/`-separated. */
  relativePath: string
  /**
   * The folder holding the file, below the tree root and `/`-separated. Empty
   * when the file sits directly in the tree root.
   */
  folder: string
}

/**
 * A media-holding folder and everything below it: an event's `footage/`, or one
 * `sorted/YYYY/MM`. The bucket and pairing rules read nothing else, which is
 * why they run against both.
 */
export type MediaTree = {
  /** Absolute path of the tree root. */
  path: string
  /** Direct children of the tree root. */
  entries: ScopeEntry[]
  /** Every folder below the root. `panorama` is listed but never descended. */
  folders: ScopeFolder[]
  /** Every file below the root, excluding anything inside a `panorama` (T3). */
  files: ScopeFile[]
}

/** The archive root itself. Only its own listing is judged. */
export type RootScope = {
  kind: 'root'
  path: string
  entries: ScopeEntry[]
}

/**
 * `sorted/` itself, or one year folder inside it. The same rule shape — every
 * entry must be a folder with an expected name — so one scope covers both.
 */
export type SortedScope = {
  kind: 'sorted'
  /** Null for `sorted/` itself; the year for a year folder inside it. */
  year: string | null
  path: string
  entries: ScopeEntry[]
}

/** One `relations/<person>/` folder. Its own listing only. */
export type PersonScope = {
  kind: 'person'
  person: string
  path: string
  entries: ScopeEntry[]
}

/** One event folder, with its `footage/` tree when it has one. */
export type EventScope = {
  kind: 'event'
  /** The folder name, e.g. `2025-05-10-Iceland`. */
  name: string
  path: string
  /** Direct children of the event folder. */
  entries: ScopeEntry[]
  /** Null when the event has no `footage/` at all. */
  footage: MediaTree | null
  /** The person folder this event belongs to, or null under `events/`. */
  person: string | null
}

/** One `sorted/YYYY/MM` folder. */
export type MonthScope = {
  kind: 'month'
  year: string
  month: string
  path: string
  tree: MediaTree
  /** The person folder this month belongs to, or null under `sorted/`. */
  person: string | null
}

export type Scope =
  RootScope | SortedScope | PersonScope | EventScope | MonthScope

/** The media tree a scope carries, or null when it carries none. */
export function scopeTree(scope: Scope): MediaTree | null {
  if (scope.kind === 'event') {
    return scope.footage
  }
  if (scope.kind === 'month') {
    return scope.tree
  }
  return null
}

/** A short label for one scope, used in findings and progress lines. */
export function scopeLabel(scope: Scope): string {
  switch (scope.kind) {
    case 'root':
      return 'archive root'
    case 'sorted':
      return scope.year === null ? 'sorted' : `sorted/${scope.year}`
    case 'person':
      return `relations/${scope.person}`
    case 'event':
      return scope.name
    case 'month':
      return `sorted/${scope.year}/${scope.month}`
  }
}
