/**
 * Split a filename into its stem and lowercased extension on the LAST dot.
 * A name with no extension (or a leading-dot dotfile like `.DS_Store`) keeps the
 * whole name as the stem and an empty ext.
 */
export function splitStem(filename: string): {stem: string; ext: string} {
  const i = filename.lastIndexOf('.')
  if (i <= 0) {
    return {stem: filename, ext: ''}
  }
  return {stem: filename.slice(0, i), ext: filename.slice(i + 1).toLowerCase()}
}
