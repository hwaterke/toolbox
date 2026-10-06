import {execFile} from 'node:child_process'
import {promisify} from 'node:util'

const run = promisify(execFile)

/** The top of the git working tree holding `cwd`. Throws outside a repo. */
export async function findRoot(cwd: string): Promise<string> {
  try {
    const {stdout} = await run('git', ['rev-parse', '--show-toplevel'], {cwd})
    return stdout.trim()
  } catch {
    throw new Error('not in a git repository')
  }
}
