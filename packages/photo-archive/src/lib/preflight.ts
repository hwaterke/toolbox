import {promises as fs} from 'node:fs'
import nodePath from 'node:path'
import {BUCKET, MEDIA_EXT_SET} from './constants.ts'
import {splitStem} from './names.ts'
import {
  checkSourceLocation,
  isValidEventName,
  isValidSourceSegment,
} from './validation.ts'

export type PreflightInput = {
  source: string
  archiveRoot: string
  event?: string | undefined
  sourceName?: string | undefined
  createEvent: boolean
}

export type PreflightOk = {
  ok: true
  /** Absolute, resolved source folder. */
  source: string
  /** Absolute, resolved archive root. */
  archiveRoot: string
  event?: string | undefined
  sourceName?: string | undefined
  /** Event folders that must be created before the first move. */
  eventToCreate?: string | undefined
}

export type PreflightFailure = {ok: false; error: string}

export type PreflightResult = PreflightOk | PreflightFailure

const fail = (error: string): PreflightFailure => ({ok: false, error})

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory()
  } catch {
    return false
  }
}

/** Levenshtein distance, used only to suggest a near-miss event folder. */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({length: b.length + 1}, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current.push(
        Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + cost)
      )
    }
    previous = current
  }
  return previous[b.length]!
}

/**
 * The closest existing event folder to `wanted`, or null when nothing is near
 * enough to be worth printing.
 */
export function suggestEvent(
  wanted: string,
  existing: readonly string[]
): string | null {
  let best: string | null = null
  let bestDistance = Infinity
  for (const candidate of existing) {
    const distance = editDistance(wanted.toLowerCase(), candidate.toLowerCase())
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    }
  }
  // Allow roughly a third of the name to differ before giving up.
  return best !== null && bestDistance <= Math.max(3, wanted.length / 3)
    ? best
    : null
}

export type FootageLayout = 'empty' | 'flat' | 'grouped' | 'mixed'

/** Classify what an event's `footage` folder already holds (decision 16). */
export function classifyFootage(
  entries: readonly {
    name: string
    isDirectory: boolean
  }[]
): FootageLayout {
  let hasLooseMedia = false
  let hasSubfolder = false
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue
    }
    if (entry.isDirectory) {
      if (entry.name !== BUCKET) {
        hasSubfolder = true
      }
      continue
    }
    if (MEDIA_EXT_SET.has(splitStem(entry.name).ext)) {
      hasLooseMedia = true
    }
  }
  if (hasLooseMedia && hasSubfolder) {
    return 'mixed'
  }
  if (hasLooseMedia) {
    return 'flat'
  }
  if (hasSubfolder) {
    return 'grouped'
  }
  return 'empty'
}

/**
 * Every check that must pass before a single file moves (decisions 15-17, 28
 * and trap T5). Returns the resolved paths on success, or the first reason to
 * stop.
 */
export async function preflight(
  input: PreflightInput
): Promise<PreflightResult> {
  const source = nodePath.resolve(input.source)
  const archiveRoot = nodePath.resolve(input.archiveRoot)

  if (!(await isDirectory(source))) {
    return fail(`Source is not a directory: ${source}`)
  }
  if (!(await isDirectory(archiveRoot))) {
    return fail(`Archive root is not a directory: ${archiveRoot}`)
  }

  // Decision 17 — the root must already look like an archive.
  const hasEvents = await isDirectory(nodePath.join(archiveRoot, 'events'))
  const hasSorted = await isDirectory(nodePath.join(archiveRoot, 'sorted'))
  if (!hasEvents && !hasSorted) {
    return fail(
      `Archive root holds neither events/ nor sorted/: ${archiveRoot}\n` +
        'Refusing to treat it as an archive.'
    )
  }

  // Decision 28 — where the source may sit.
  const location = checkSourceLocation(source, archiveRoot)
  if (location === 'is_archive_root') {
    return fail('Source is the archive root itself.')
  }
  if (location === 'inside_events') {
    return fail(`Source is inside events/: ${source}`)
  }
  if (location === 'inside_sorted') {
    return fail(`Source is inside sorted/: ${source}`)
  }
  if (location === 'inside_bucket') {
    return fail(`Source is inside a ${BUCKET}/ folder: ${source}`)
  }

  // Trap T5 — --source is a single safe segment and needs --event.
  if (input.sourceName !== undefined) {
    if (input.event === undefined) {
      return fail('--source requires --event.')
    }
    if (!isValidSourceSegment(input.sourceName)) {
      return fail(
        `--source must be a single folder name, e.g. "dji": ${input.sourceName}`
      )
    }
  }

  if (input.event === undefined) {
    if (input.createEvent) {
      return fail('--create-event requires --event.')
    }
    if (!hasSorted) {
      return fail(`Sorted mode needs ${nodePath.join(archiveRoot, 'sorted')}`)
    }
    return {ok: true, source, archiveRoot}
  }

  // Decision 15 — the event folder, its name, and near-match suggestions.
  if (!isValidEventName(input.event)) {
    return fail(`Event name must be YYYY-MM-DD-Name: ${input.event}`)
  }

  const eventsRoot = nodePath.join(archiveRoot, 'events')
  if (!hasEvents) {
    return fail(`Archive root has no events/ folder: ${archiveRoot}`)
  }

  const eventPath = nodePath.join(eventsRoot, input.event)
  const eventExists = await isDirectory(eventPath)

  if (!eventExists) {
    if (!input.createEvent) {
      const existing = (await fs.readdir(eventsRoot, {withFileTypes: true}))
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => entry.name)
      const suggestion = suggestEvent(input.event, existing)
      return fail(
        `Event folder does not exist: ${eventPath}` +
          (suggestion === null
            ? '\nPass --create-event to make it.'
            : `\nDid you mean "${suggestion}"? Otherwise pass --create-event.`)
      )
    }
    return {
      ok: true,
      source,
      archiveRoot,
      event: input.event,
      sourceName: input.sourceName,
      eventToCreate: input.event,
    }
  }

  // Decision 16 — refuse to mix flat and grouped footage layouts.
  const footagePath = nodePath.join(eventPath, 'footage')
  if (await isDirectory(footagePath)) {
    const entries = (await fs.readdir(footagePath, {withFileTypes: true})).map(
      (entry) => ({name: entry.name, isDirectory: entry.isDirectory()})
    )
    const layout = classifyFootage(entries)
    if (layout === 'mixed') {
      return fail(
        `footage/ already mixes loose media and sub-folders: ${footagePath}\n` +
          'Tidy it by hand before ingesting.'
      )
    }
    if (layout === 'flat' && input.sourceName !== undefined) {
      return fail(
        `footage/ holds loose media, so it uses the flat layout: ${footagePath}\n` +
          'Drop --source, or move the loose files into a sub-folder first.'
      )
    }
    if (layout === 'grouped' && input.sourceName === undefined) {
      return fail(
        `footage/ holds sub-folders, so it uses the grouped layout: ${footagePath}\n` +
          'Pass --source NAME to say which one these files belong to.'
      )
    }
  }

  return {
    ok: true,
    source,
    archiveRoot,
    event: input.event,
    sourceName: input.sourceName,
  }
}
