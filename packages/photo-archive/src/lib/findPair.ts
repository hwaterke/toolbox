import {splitStem} from '@hwaterke/file-utils'
import {PAIR_WINDOW_SECONDS, PHOTO_EXT_SET} from './constants.ts'
import {parseTimestampedName} from './names.ts'

export type FindPairResult =
  | {method: 'exact'; photo: string}
  | {method: 'pass2'; photo: string}
  | {method: 'ambiguous'; candidates: string[]}
  | null

/**
 * Decide whether a RAW pairs with a viewable photo among its directory
 * siblings.
 *
 *   Pass 1 (exact)  — a sibling photo whose full stem equals the RAW's stem.
 *                     Covers DSLR shots that share an identical capture stamp.
 *   Pass 2 (token)  — only if the RAW name is timestamp-prefixed: sibling
 *                     photos that also parse, carry the same trailing token,
 *                     and whose capture time is within PAIR_WINDOW_SECONDS.
 *                     Catches the drone JPG/RAW ~1s offset. Exactly one
 *                     candidate -> pair; zero -> no pair; two or more ->
 *                     ambiguous (never guess).
 *
 * `siblings` is a listing of filenames. The RAW itself may be present and is
 * harmless: it is never a viewable photo.
 */
export function findPair(
  rawFile: string,
  siblings: readonly string[]
): FindPairResult {
  const raw = splitStem(rawFile)

  // Pass 1: exact-stem viewable photo.
  for (const name of siblings) {
    const sibling = splitStem(name)
    if (sibling.stem === raw.stem && PHOTO_EXT_SET.has(sibling.ext)) {
      return {method: 'exact', photo: name}
    }
  }

  // Pass 2: trailing-token fallback, guarded by uniqueness + time window.
  const rawParsed = parseTimestampedName(raw.stem)
  if (rawParsed === null) {
    return null
  }

  const candidates: string[] = []
  for (const name of siblings) {
    const sibling = splitStem(name)
    if (!PHOTO_EXT_SET.has(sibling.ext)) {
      continue
    }
    const parsed = parseTimestampedName(sibling.stem)
    if (parsed === null) {
      continue
    }
    if (parsed.token !== rawParsed.token) {
      continue
    }
    if (
      Math.abs(parsed.epochSeconds - rawParsed.epochSeconds) >
      PAIR_WINDOW_SECONDS
    ) {
      continue
    }
    candidates.push(name)
  }

  if (candidates.length === 1) {
    return {method: 'pass2', photo: candidates[0]!}
  }
  if (candidates.length >= 2) {
    return {method: 'ambiguous', candidates}
  }
  return null
}
