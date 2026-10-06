export const USAGE = 'usage: tasks new|list|find|deps|check [args]'

/**
 * Runs one invocation and returns its exit code. No command exists yet, so
 * every invocation is a usage error.
 */
export function main(_argv: readonly string[]): number {
  process.stderr.write(`${USAGE}\n`)
  return 1
}
