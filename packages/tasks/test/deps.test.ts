import {afterEach, beforeEach, expect, test} from 'vitest'
import {deps} from '../src/commands/deps.ts'
import {loadTasks} from '../src/load.ts'
import {makeTempRepo, run, type TempRepo} from './utils/tempRepo.ts'

let repo: TempRepo

const task = (title: string, status: string, depends = '') =>
  `---\ntitle: ${title}\nstatus: ${status}\n${depends}---\n`

beforeEach(async () => {
  repo = await makeTempRepo()
  await repo.write({
    'tasks/TASK-1.md': task('Base', 'done'),
    'tasks/TASK-2.md': task(
      'Middle',
      'doing',
      'depends: [TASK-3, TASK-1, TASK-3]\n'
    ),
    'tasks/TASK-3.md': task('Other base', 'todo'),
    'tasks/TASK-4.md': task('Top', 'idea', 'depends: [TASK-2]\n'),
    'tasks/TASK-10.md': task(
      'Also top',
      'todo',
      'depends: [TASK-2, TASK-99, TASK-12]\n'
    ),
    'tasks/TASK-11.md': task('Alone', 'todo'),
    'tasks/TASK-12.md':
      '---\ntitle: Broken\nstatus: later\ndepends: [TASK-2]\n---\n',
  })
})

afterEach(async () => {
  await repo.cleanup()
})

const linked = async (...args: string[]) =>
  deps(await loadTasks(repo.dir), args)

test('needs in depends order, then blocks by id, direct links only', async () => {
  expect(await linked('TASK-2')).toEqual([
    'needs TASK-3 todo Other base',
    'needs TASK-1 done Base',
    'blocks TASK-4 idea Top',
    'blocks TASK-10 todo Also top',
  ])
  expect(await linked('TASK-1')).toEqual(['blocks TASK-2 doing Middle'])
})

test('a link to a missing or invalid file says so', async () => {
  expect(await linked('TASK-10')).toEqual([
    'needs TASK-2 doing Middle',
    'needs TASK-99 missing',
    'needs TASK-12 invalid',
  ])
})

test('a task without links prints nothing', async () => {
  expect(await linked('TASK-11')).toEqual([])
})

test('takes exactly one existing, valid task id', async () => {
  await expect(linked()).rejects.toThrow('usage: tasks deps TASK-n')
  await expect(linked('TASK-1', 'TASK-2')).rejects.toThrow(
    'usage: tasks deps TASK-n'
  )
  await expect(linked('task-1')).rejects.toThrow('task-1 is not a TASK-n id')
  await expect(linked('TASK-99')).rejects.toThrow('TASK-99 does not exist')
  await expect(linked('TASK-12')).rejects.toThrow(
    'TASK-12 is invalid; run tasks check'
  )
})

test('tasks deps prints one line per link and exits 0', async () => {
  const BIN = new URL('../bin/run.ts', import.meta.url).pathname
  expect((await run(BIN, ['deps', 'TASK-4'], {cwd: repo.dir})).stdout).toBe(
    'needs TASK-2 doing Middle\n'
  )
  await expect(
    run(BIN, ['deps', 'TASK-99'], {cwd: repo.dir})
  ).rejects.toMatchObject({
    code: 1,
    stdout: '',
    stderr: 'TASK-99 does not exist\n',
  })
})
