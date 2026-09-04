import type {Temporal} from 'temporal-polyfill'

const pad = (value: number, width: number): string =>
  String(value).padStart(width, '0')

/**
 * The format tokens `--prefix` accepts. These are the ones luxon's `toFormat`
 * was given anywhere in this repo, and they keep luxon's meaning.
 *
 * `uu` truncates rather than rounds, so 45 ms prints `04` and 7 ms prints
 * `00`, exactly as luxon did.
 */
const TOKENS: Record<string, (time: Temporal.ZonedDateTime) => string> = {
  yyyy: (time) => pad(time.year, 4),
  SSS: (time) => pad(time.millisecond, 3),
  MM: (time) => pad(time.month, 2),
  dd: (time) => pad(time.day, 2),
  HH: (time) => pad(time.hour, 2),
  mm: (time) => pad(time.minute, 2),
  ss: (time) => pad(time.second, 2),
  uu: (time) => pad(Math.floor(time.millisecond / 10), 2),
  ZZ: (time) => time.offset,
}

/** Longest first, so `yyyy` wins over a shorter token with the same start. */
const TOKEN_NAMES = Object.keys(TOKENS).sort((a, b) => b.length - a.length)

/**
 * Renders `time` through a format string such as `yyyy-MM-dd_HH-mm-ss_`.
 *
 * Anything that is not one of the supported tokens is copied out as-is, so
 * separators, words and unsupported tokens all survive untouched.
 */
export const formatDateTime = (
  time: Temporal.ZonedDateTime,
  format: string
): string => {
  let result = ''
  let index = 0

  while (index < format.length) {
    const token = TOKEN_NAMES.find((name) => format.startsWith(name, index))

    if (token) {
      result += TOKENS[token]!(time)
      index += token.length
    } else {
      result += format[index]
      index += 1
    }
  }

  return result
}
