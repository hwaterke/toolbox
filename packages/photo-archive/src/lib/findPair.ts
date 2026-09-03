import {splitStem} from '@hwaterke/file-utils'
import {PAIR_WINDOW_SECONDS, PHOTO_EXT_SET} from './constants.ts'
import {parseTimestampedName} from './names.ts'

/**
 * A file a RAW might pair with: its filename, and the full path it was found
 * at. Both are needed — the name is what pairing compares, the path is how a
 * caller learns which folder the twin lives in (T2).
 */
export type PairCandidate = {name: string; path: string}

export type FindPairResult =
  | {method: 'exact'; photo: PairCandidate}
  | {method: 'pass2'; photo: PairCandidate}
  | {method: 'ambiguous'; candidates: PairCandidate[]}
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
 * `candidates` is the set of files that could be the twin, each with the path
 * it was found at. Matching only ever reads `name` — never the path, which may
 * contain dots of its own (T2). The RAW itself may be present and is harmless:
 * it is never a viewable photo.
 */
export function findPair(
  rawFile: string,
  candidates: readonly PairCandidate[]
): FindPairResult {
  const raw = splitStem(rawFile)

  // Pass 1: exact-stem viewable photo.
  for (const candidate of candidates) {
    const sibling = splitStem(candidate.name)
    if (sibling.stem === raw.stem && PHOTO_EXT_SET.has(sibling.ext)) {
      return {method: 'exact', photo: candidate}
    }
  }

  // Pass 2: trailing-token fallback, guarded by uniqueness + time window.
  const rawParsed = parseTimestampedName(raw.stem)
  if (rawParsed === null) {
    return null
  }

  const matches: PairCandidate[] = []
  for (const candidate of candidates) {
    const sibling = splitStem(candidate.name)
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
    matches.push(candidate)
  }

  if (matches.length === 1) {
    return {method: 'pass2', photo: matches[0]!}
  }
  if (matches.length >= 2) {
    return {method: 'ambiguous', candidates: matches}
  }
  return null
}
