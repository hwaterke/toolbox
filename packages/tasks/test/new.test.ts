import {execFileSync} from 'node:child_process'
import {readFile, rm} from 'node:fs/promises'
import nodePath from 'node:path'
import {afterEach, beforeEach, expect, test} from 'vitest'
import {check} from '../src/commands/check.ts'
import {newTask} from '../src/commands/new.ts'
import {loadTasks} from '../src/load.ts'
import {makeTempRepo, run, type TempRepo} from './utils/tempRepo.ts'

let repo: TempRepo

beforeEach(async () => {
  repo = await makeTempRepo()
})

afterEach(async () => {
  await repo.cleanup()
})

const BIN = new URL('../bin/run.ts', import.meta.url).pathname
const read = (file: string) => readFile(nodePath.join(repo.dir, file), 'utf8')
const git = (...args: string[]) =>
  run('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd: repo.dir,
  })

test('writes frontmatter only, status idea, and returns the path', async () => {
  expect(await newTask(repo.dir, {title: 'Fix the map'})).toBe(
    'tasks/TASK-1.md'
  )
  expect(await read('tasks/TASK-1.md')).toBe(
    '---\ntitle: Fix the map\nstatus: idea\n---\n'
  )
  expect(await check(repo.dir)).toEqual([])
})

test('takes a status, and rejects an unknown one or an empty title', async () => {
  await newTask(repo.dir, {title: 'Now', status: 'todo'})
  expect(await read('tasks/TASK-1.md')).toContain('\nstatus: todo\n')
  await expect(
    newTask(repo.dir, {title: 'X', status: 'later'})
  ).rejects.toThrow('unknown status "later"')
  await expect(newTask(repo.dir, {title: '  '})).rejects.toThrow(
    'the title is empty'
  )
})

test('titles read back unchanged, quoted only when YAML needs it', async () => {
  const titles = [
    'Fix #3: the map',
    '42',
    'true',
    'null',
    "'quoted'",
    `A long title ${'that keeps going '.repeat(8)}on one line`,
  ]
  for (const title of titles) await newTask(repo.dir, {title})
  const tasks = await loadTasks(repo.dir)
  expect(tasks.map((task) => task.frontmatter?.title)).toEqual(titles)
  expect(tasks.flatMap((task) => task.problems)).toEqual([])
  expect(await read('tasks/TASK-1.md')).toContain('title: "Fix #3: the map"\n')
  expect((await read('tasks/TASK-6.md')).split('\n')).toHaveLength(5)
})

test('writes the body, minus empty sections', async () => {
  await newTask(repo.dir, {
    title: 'With body',
    body:
      '## Description\n\nWhy it matters.\n\n## Acceptance criteria\n\n\n' +
      '## Plan\n\n### Phase 1\n\n- [ ] 1.1 Step\n\n',
  })
  expect(await read('tasks/TASK-1.md')).toBe(
    '---\ntitle: With body\nstatus: idea\n---\n\n' +
      '## Description\n\nWhy it matters.\n\n## Plan\n\n### Phase 1\n\n- [ ] 1.1 Step\n'
  )
})

test('the next id is free across the working tree, branches and worktrees', async () => {
  await repo.write({'tasks/TASK-2.md': '---\ntitle: Two\nstatus: idea\n---\n'})
  await git('add', '.')
  await git('commit', '-qm', 'two')
  await git('checkout', '-qb', 'other')
  await repo.write({
    'tasks/TASK-7.md': '---\ntitle: Seven\nstatus: idea\n---\n',
  })
  await git('add', '.')
  await git('commit', '-qm', 'seven')
  await git('checkout', '-q', '-')

  // TASK-7 is only on the other branch.
  expect(await newTask(repo.dir, {title: 'Eight'})).toBe('tasks/TASK-8.md')

  const worktree = `${repo.dir}-wt`
  try {
    await git('worktree', 'add', '-qb', 'wt', worktree)
    await run('mkdir', ['-p', `${worktree}/tasks`])
    await run('cp', [
      nodePath.join(repo.dir, 'tasks/TASK-2.md'),
      `${worktree}/tasks/TASK-12.md`,
    ])
    // TASK-12 is uncommitted, in another worktree.
    expect(await newTask(repo.dir, {title: 'Thirteen'})).toBe(
      'tasks/TASK-13.md'
    )
  } finally {
    await rm(worktree, {recursive: true, force: true})
  }
})

test('tasks new reads the body from stdin with -, and prints the path', () => {
  const stdout = execFileSync(
    BIN,
    ['new', '-', 'From stdin', '--status', 'todo'],
    {
      cwd: repo.dir,
      input: '## Description\n\nPiped in.\n',
      encoding: 'utf8',
    }
  )
  expect(stdout).toBe('tasks/TASK-1.md\n')
  return expect(read('tasks/TASK-1.md')).resolves.toBe(
    '---\ntitle: From stdin\nstatus: todo\n---\n\n## Description\n\nPiped in.\n'
  )
})

test('tasks new takes exactly one title', async () => {
  for (const args of [['new'], ['new', 'Two', 'words']]) {
    await expect(run(BIN, args, {cwd: repo.dir})).rejects.toMatchObject({
      code: 1,
      stdout: '',
      stderr: 'usage: tasks new "title" [--status s] [-]\n',
    })
  }
})
