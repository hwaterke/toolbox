import {afterEach, beforeEach, expect, test} from 'vitest'
import {list, type ListOptions} from '../src/commands/list.ts'
import {loadTasks} from '../src/load.ts'
import {makeTempRepo, run, type TempRepo} from './utils/tempRepo.ts'

let repo: TempRepo

beforeEach(async () => {
  repo = await makeTempRepo()
  const task = (title: string, status: string, depends = '') =>
    `---\ntitle: ${JSON.stringify(title)}\nstatus: ${status}\n${depends}---\n`
  await repo.write({
    'tasks/TASK-1.md': task('Done thing', 'done'),
    'tasks/TASK-2.md': task('Next after done', 'todo', 'depends: [TASK-1]\n'),
    'tasks/TASK-3.md': task('In progress', 'doing'),
    'tasks/TASK-4.md': task(
      'Waits on doing',
      'todo',
      'depends: [TASK-1, TASK-3]\n'
    ),
    'tasks/TASK-5.md': task('An idea', 'idea'),
    'tasks/TASK-6.md': task('Dropped thing', 'dropped'),
    'tasks/TASK-10.md': task(
      'Fix #3: a long title that is never cut, because its words are what find and grep match on',
      'todo'
    ),
    'tasks/TASK-11.md': task(
      'Waits on a missing task',
      'todo',
      'depends: [TASK-99]\n'
    ),
    'tasks/TASK-12.md': '---\ntitle: Broken\nstatus: later\n---\n',
    'tasks/notes.md': task('No id', 'todo'),
  })
})

afterEach(async () => {
  await repo.cleanup()
})

const listed = async (options?: ListOptions) =>
  list(await loadTasks(repo.dir), options)

test('lists todo and doing by default, by id, titles whole', async () => {
  expect(await listed()).toEqual([
    'TASK-2 todo Next after done',
    'TASK-3 doing In progress',
    'TASK-4 todo Waits on doing',
    'TASK-10 todo Fix #3: a long title that is never cut, because its words are what find and grep match on',
    'TASK-11 todo Waits on a missing task',
  ])
})

test('--all lists every status, and skips files check would reject', async () => {
  expect(await listed({all: true})).toEqual([
    'TASK-1 done Done thing',
    'TASK-2 todo Next after done',
    'TASK-3 doing In progress',
    'TASK-4 todo Waits on doing',
    'TASK-5 idea An idea',
    'TASK-6 dropped Dropped thing',
    'TASK-10 todo Fix #3: a long title that is never cut, because its words are what find and grep match on',
    'TASK-11 todo Waits on a missing task',
  ])
})

test('--status lists the given statuses', async () => {
  expect(await listed({status: ['idea']})).toEqual(['TASK-5 idea An idea'])
  expect(await listed({status: ['dropped', 'done']})).toEqual([
    'TASK-1 done Done thing',
    'TASK-6 dropped Dropped thing',
  ])
})

test('--open lists idea, todo and doing', async () => {
  expect(await listed({open: true})).toEqual([
    'TASK-2 todo Next after done',
    'TASK-3 doing In progress',
    'TASK-4 todo Waits on doing',
    'TASK-5 idea An idea',
    'TASK-10 todo Fix #3: a long title that is never cut, because its words are what find and grep match on',
    'TASK-11 todo Waits on a missing task',
  ])
})

test('--ready lists todo tasks whose dependencies are all done', async () => {
  expect(await listed({ready: true})).toEqual([
    'TASK-2 todo Next after done',
    'TASK-10 todo Fix #3: a long title that is never cut, because its words are what find and grep match on',
  ])
})

test('an unknown status is an error', async () => {
  await expect(listed({status: ['To Do']})).rejects.toThrow(
    'unknown status "To Do"; use idea|todo|doing|done|dropped'
  )
})

test('the filters do not combine', async () => {
  await expect(listed({all: true, ready: true})).rejects.toThrow(
    'use one of --all, --open, --status, --ready'
  )
  await expect(listed({open: true, status: ['idea']})).rejects.toThrow(
    'use one of --all, --open, --status, --ready'
  )
})

test('tasks list prints one line per task and exits 0; errors are one line', async () => {
  const BIN = new URL('../bin/run.ts', import.meta.url).pathname
  const {stdout} = await run(BIN, ['list', '--status', 'idea'], {cwd: repo.dir})
  expect(stdout).toBe('TASK-5 idea An idea\n')
  const open = await run(BIN, ['list', '--open'], {cwd: repo.dir})
  expect(open.stdout).toContain('TASK-5 idea An idea\n')
  await expect(
    run(BIN, ['list', '--status', 'later'], {cwd: repo.dir})
  ).rejects.toMatchObject({
    code: 1,
    stdout: '',
    stderr: 'unknown status "later"; use idea|todo|doing|done|dropped\n',
  })
})
