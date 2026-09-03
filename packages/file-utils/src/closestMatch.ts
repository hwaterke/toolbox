/** Levenshtein distance, used only to suggest a near-miss name. */
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
 * The closest name in `existing` to `wanted`, or null when nothing is near
 * enough to be worth printing.
 */
export function closestMatch(
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
