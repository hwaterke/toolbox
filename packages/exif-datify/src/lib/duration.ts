const CLOCK_REGEX = /^(\d{1,2}):(\d{2}):(\d{2})$/
const SECONDS_REGEX = /^(\d{1,2})\.(\d{2}) s$/

/**
 * Reads `QuickTime:Duration` as exiftool prints it.
 *
 * exiftool uses two shapes and switches between them by length: `0:01:23`
 * for a minute or more, and `3.64 s` below that - measured on GoPro and
 * iPhone footage. The fraction is hundredths, so `3.64 s` is 3.64 seconds.
 */
export function durationToSeconds(duration: string): number {
  const clock = CLOCK_REGEX.exec(duration)
  if (clock) {
    const [, hours, minutes, seconds] = clock
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
  }

  const short = SECONDS_REGEX.exec(duration)
  if (short) {
    const [, seconds, hundredths] = short
    return Number(seconds) + Number(hundredths) / 100
  }

  throw new Error(`Invalid duration format ${duration}`)
}
