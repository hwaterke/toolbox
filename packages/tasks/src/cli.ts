import {parseArgs} from 'node:util'
import {check} from './commands/check.ts'
import {find} from './commands/find.ts'
import {list} from './commands/list.ts'
import {loadTasks} from './load.ts'
import {findRoot} from './repo.ts'

export const USAGE = 'usage: tasks new|list|find|deps|check [args]'

/** Runs one invocation and returns its exit code. */
export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...args] = argv
  try {
    switch (command) {
      case 'check': {
        const {positionals} = parseArgs({args, allowPositionals: true})
        const root = await findRoot(process.cwd())
        const lines = await check(root, positionals, process.cwd())
        write(lines)
        return lines.length > 0 ? 1 : 0
      }
      case 'list': {
        const {values} = parseArgs({
          args,
          options: {
            all: {type: 'boolean'},
            status: {type: 'string', multiple: true},
            ready: {type: 'boolean'},
          },
        })
        write(list(await loadTasks(await findRoot(process.cwd())), values))
        return 0
      }
      case 'find': {
        const {positionals} = parseArgs({args, allowPositionals: true})
        write(find(await loadTasks(await findRoot(process.cwd())), positionals))
        return 0
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

function write(lines: readonly string[]) {
  for (const line of lines) process.stdout.write(`${line}\n`)
}
