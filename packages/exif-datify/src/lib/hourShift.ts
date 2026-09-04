const MS_IN_HOUR = 3_600_000

export const DIFFERENCE_THRESHOLD_SECONDS = 45

/**
 * Works out how many whole hours a DJI file's metadata clock is off by.
 *
 * The file modification time is trusted: it is written when the camera
 * finishes the recording, so the video started `durationSeconds` earlier.
 * The gap between that start and the metadata time should be a whole number
 * of hours - the timezone the camera never applied. Anything left over past
 * `DIFFERENCE_THRESHOLD_SECONDS` means the two clocks disagree for some
 * other reason, and that is an error rather than a shift to apply.
 *
 * Milliseconds in, hours out: no date library is involved, so the caller
 * decides what to subtract them from.
 */
export function hourDifference({
  metadataTimeMs,
  fileTimeMs,
  durationSeconds,
}: {
  metadataTimeMs: number
  fileTimeMs: number
  durationSeconds: number
}): number {
  const differenceMs = metadataTimeMs - (fileTimeMs - durationSeconds * 1000)
  const roundHourDifference = Math.round(differenceMs / MS_IN_HOUR)

  const secondsRemaining =
    Math.abs(roundHourDifference * MS_IN_HOUR - differenceMs) / 1000

  if (secondsRemaining > DIFFERENCE_THRESHOLD_SECONDS) {
    throw new Error(
      `Difference is too large: ${secondsRemaining} seconds. Please check the file time manually.`
    )
  }

  return roundHourDifference
}
