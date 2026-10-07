import {parseArgs} from 'node:util'
import {check} from './commands/check.ts'
import {deps} from './commands/deps.ts'
import {find} from './commands/find.ts'
import {list} from './commands/list.ts'
import {newTask} from './commands/new.ts'
import {COMMAND_HELP, OVERVIEW} from './help.ts'
import {loadTasks} from './load.ts'
import {findRoot} from './repo.ts'

export const USAGE =
  'usage: tasks new|list|find|deps|check [args], or tasks --help'

/** Runs one invocation and returns its exit code. */
export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...args] = argv
  const help = helpFor(command, args)
  if (help !== undefined) {
    write([help])
    return 0
  }
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
            open: {type: 'boolean'},
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
      case 'deps': {
        const {positionals} = parseArgs({args, allowPositionals: true})
        write(deps(await loadTasks(await findRoot(process.cwd())), positionals))
        return 0
      }
      case 'new': {
        const {values, positionals} = parseArgs({
          args,
          allowPositionals: true,
          options: {status: {type: 'string'}},
        })
        const fromStdin = positionals.includes('-')
        const titles = positionals.filter((positional) => positional !== '-')
        const [title] = titles
        if (title === undefined || titles.length > 1) {
          throw new Error('usage: tasks new "title" [--status s] [-]')
        }
        const body = fromStdin ? await readStdin() : ''
        const root = await findRoot(process.cwd())
        write([await newTask(root, {title, status: values.status, body})])
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

/**
 * The help text that `tasks --help`, `tasks help [command]` or
 * `tasks <command> --help` asks for, or undefined when none is asked for.
 */
function helpFor(
  command: string | undefined,
  args: readonly string[]
): string | undefined {
  if (command === '--help' || command === '-h' || command === 'help') {
    const [topic] = args
    return topic !== undefined && Object.hasOwn(COMMAND_HELP, topic)
      ? COMMAND_HELP[topic]
      : OVERVIEW
  }
  if (command === undefined || !Object.hasOwn(COMMAND_HELP, command)) {
    return undefined
  }
  // Arguments after `--` are words, not flags.
  const end = args.indexOf('--')
  const flags = end === -1 ? args : args.slice(0, end)
  return flags.includes('--help') || flags.includes('-h')
    ? COMMAND_HELP[command]
    : undefined
}

function write(lines: readonly string[]) {
  for (const line of lines) process.stdout.write(`${line}\n`)
}

async function readStdin(): Promise<string> {
  let text = ''
  for await (const chunk of process.stdin) text += String(chunk)
  return text
}
