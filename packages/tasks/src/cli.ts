import {parseArgs} from 'node:util'
import {check} from './commands/check.ts'
import {findRoot} from './repo.ts'

export const USAGE = 'usage: tasks new|list|find|deps|check [args]'

/** Runs one invocation and returns its exit code. */
export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...args] = argv
  try {
    switch (command) {
      case 'check': {
        parseArgs({args, options: {}})
        const lines = await check(await findRoot(process.cwd()))
        for (const line of lines) process.stdout.write(`${line}\n`)
        return lines.length > 0 ? 1 : 0
      }
      default:
        process.stderr.write(`${USAGE}\n`)
        return 1
    }
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`)
    return 1
  }
}
