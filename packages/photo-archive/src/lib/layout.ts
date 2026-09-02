import {BUCKET} from './constants.ts'

export type ResolveDestinationInput = {
  /** Zero-padded year and month from the filename prefix. */
  year: string
  month: string
  /** True for a `.nef`/`.dng`. */
  isRaw: boolean
  /** True when a viewable twin was found in the batch or at the destination. */
  hasPair: boolean
  /** Event folder name, e.g. `2025-05-10-Iceland`. Absent means sorted mode. */
  event?: string | undefined
  /** Sub-folder inside `footage`, e.g. `dji`. Requires `event`. */
  source?: string | undefined
}

/**
 * The destination folder for one file, relative to the archive root and using
 * `/` separators.
 *
 * Only a RAW with a viewable twin goes to the `raw_versions` bucket; a lone RAW
 * lands in the normal folder so Immich still indexes it (decision 4).
 *
 * In `--source` mode the bucket mirrors the source name *under* `raw_versions`
 * (`footage/raw_versions/S`), not the other way round.
 */
export function resolveDestination(input: ResolveDestinationInput): string {
  const {year, month, isRaw, hasPair, event, source} = input

  if (source !== undefined && event === undefined) {
    throw new Error('resolveDestination: `source` requires `event`')
  }

  const bucketed = isRaw && hasPair

  if (event === undefined) {
    const base = `sorted/${year}/${month}`
    return bucketed ? `${base}/${BUCKET}` : base
  }

  const footage = `events/${event}/footage`
  if (source === undefined) {
    return bucketed ? `${footage}/${BUCKET}` : footage
  }
  return bucketed ? `${footage}/${BUCKET}/${source}` : `${footage}/${source}`
}
