import {execFile} from 'node:child_process'
import {readdir} from 'node:fs/promises'
import nodePath from 'node:path'
import {promisify} from 'node:util'
import {TASKS_DIR} from './load.ts'

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

const TASK_FILE = /^TASK-([1-9]\d*)\.md$/

/**
 * One past the highest task number in any `tasks/` folder this repo can see:
 * every worktree's folder, committed or not, and every local branch. A task
 * made in another worktree is on no branch until it is committed.
 */
export async function nextId(root: string): Promise<string> {
  const names: string[] = []

  const {stdout: worktrees} = await run(
    'git',
    ['worktree', 'list', '--porcelain'],
    {
      cwd: root,
    }
  )
  for (const line of worktrees.split('\n')) {
    if (!line.startsWith('worktree ')) continue
    const dir = nodePath.join(line.slice('worktree '.length), TASKS_DIR)
    names.push(...(await readdir(dir).catch(() => [])))
  }

  const {stdout: branches} = await run(
    'git',
    ['for-each-ref', '--format=%(refname)', 'refs/heads'],
    {cwd: root}
  )
  for (const ref of branches.split('\n').filter(Boolean)) {
    const {stdout} = await run(
      'git',
      ['ls-tree', '--name-only', ref, `${TASKS_DIR}/`],
      {
        cwd: root,
      }
    )
    names.push(...stdout.split('\n').map((path) => nodePath.basename(path)))
  }

  const numbers = names.flatMap((name) => {
    const match = TASK_FILE.exec(name)
    return match?.[1] ? [Number(match[1])] : []
  })
  return `TASK-${Math.max(0, ...numbers) + 1}`
}
