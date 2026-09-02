// A sensible default maximum filename length (many filesystems limit at 255)
const DEFAULT_MAX_LENGTH = 255

export function sanitizeFilename(
  input: string,
  options?: {
    maxLength?: number // truncate to this length; default 255
    toLower?: boolean // convert to lowercase; default true
  }
): string {
  const maxLength = options?.maxLength ?? DEFAULT_MAX_LENGTH
  const toLower = options?.toLower ?? true

  if (!input) {
    return 'unnamed'
  }

  // 1. Normalize & remove accents (diacritics)
  let result = input.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // 2. Trim and replace whitespace with '-'
  result = result.trim()
  result = result.replace(/\s+/g, '-')

  // 3. Remove characters that are illegal or problematic on common OSes
  // Windows: / \ ? < > : * | "
  result = result.replace(/[\/\\?<>:*|"]/g, '')

  // 4. Remove control characters (ASCII control range)
  result = result.replace(/[\x00-\x1f\x80-\x9f]/g, '')

  // 5. Remove anything that's not: letters, digits, dot, underscore, hyphen
  // NOTE: this is where your regex was failing; we keep it **static** here.
  result = result.replace(/[^a-zA-Z0-9._-]/g, '')

  // 6. Collapse multiple '-' into one, and trim them at the start/end
  result = result.replace(/-+/g, '-') // "foo--bar" -> "foo-bar"
  result = result.replace(/^-+|-+$/g, '') // "-foo-" -> "foo"

  // 7. Windows doesn't like trailing dots or spaces
  result = result.replace(/[. ]+$/g, '')

  // 8. Avoid reserved Windows names (CON, PRN, AUX, NUL, COM1, ..., LPT9)
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(result)) {
    result = '_' + result
  }

  // 9. Enforce a sane maximum length (commonly 255)
  if (result.length > maxLength) {
    result = result.slice(0, maxLength)
  }

  // 10. Fallback if everything got stripped
  if (!result) {
    result = 'unnamed'
  }

  if (toLower) {
    result = result.toLowerCase()
  }

  return result
}
