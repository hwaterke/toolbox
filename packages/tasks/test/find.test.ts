import {afterEach, beforeEach, expect, test} from 'vitest'
import {find} from '../src/commands/find.ts'
import {loadTasks} from '../src/load.ts'
import {makeTempRepo, run, type TempRepo} from './utils/tempRepo.ts'

let repo: TempRepo

beforeEach(async () => {
  repo = await makeTempRepo()
})

afterEach(async () => {
  await repo.cleanup()
})

const task = (title: string, status: string, body = '') =>
  `---\ntitle: ${title}\nstatus: ${status}\n---\n${body}`

async function found(files: Record<string, string>, ...words: string[]) {
  await repo.write(files)
  return find(await loadTasks(repo.dir), words)
}

test('matches any word, case-insensitive substring, in titles and bodies', async () => {
  expect(
    await found(
      {
        'tasks/TASK-1.md': task('Dual-grid tileset', 'todo'),
        'tasks/TASK-2.md': task(
          'Movement',
          'idea',
          '\nUses the TILESET loader.\n'
        ),
        'tasks/TASK-3.md': task('Unrelated', 'todo', '\nNothing here.\n'),
        'tasks/TASK-4.md': task('Grids everywhere', 'done'),
      },
      'grid',
      'tileset'
    )
  ).toEqual([
    'TASK-1 todo Dual-grid tileset',
    'TASK-2 idea Movement',
    'TASK-4 done Grids everywhere',
  ])
})

test('open tasks come first, even when a closed one matches more words', async () => {
  expect(
    await found(
      {
        'tasks/TASK-1.md': task('Map grid tiles', 'done'),
        'tasks/TASK-2.md': task('Map', 'dropped', '\nNot wanted.\n'),
        'tasks/TASK-3.md': task('Tiles', 'idea'),
        'tasks/TASK-4.md': task('Map', 'doing'),
      },
      'map',
      'grid',
      'tiles'
    )
  ).toEqual([
    'TASK-3 idea Tiles',
    'TASK-4 doing Map',
    'TASK-1 done Map grid tiles',
    'TASK-2 dropped Map',
  ])
})

test('then the most words matched, then by id', async () => {
  expect(
    await found(
      {
        'tasks/TASK-1.md': task('Map', 'todo'),
        'tasks/TASK-2.md': task('Map grid', 'todo'),
        'tasks/TASK-3.md': task('Grid', 'todo', '\nTiles on the map.\n'),
        'tasks/TASK-10.md': task('Tiles', 'todo'),
        'tasks/TASK-11.md': task('Map', 'todo'),
      },
      'map',
      'grid',
      'tiles'
    )
  ).toEqual([
    'TASK-3 todo Grid',
    'TASK-2 todo Map grid',
    'TASK-1 todo Map',
    'TASK-10 todo Tiles',
    'TASK-11 todo Map',
  ])
})

test('a repeated word counts once', async () => {
  expect(
    await found(
      {
        'tasks/TASK-1.md': task('Map', 'todo'),
        'tasks/TASK-2.md': task('Grid tiles', 'todo'),
      },
      'map',
      'MAP',
      'grid',
      'tiles'
    )
  ).toEqual(['TASK-2 todo Grid tiles', 'TASK-1 todo Map'])
})

test('skips files check would reject, and the frontmatter keys', async () => {
  expect(
    await found(
      {
        'tasks/TASK-1.md': '---\ntitle: Map\nstatus: later\n---\n',
        'tasks/notes.md': task('Map', 'todo'),
        'tasks/TASK-2.md':
          '---\ntitle: Other\nstatus: todo\nlabels: [map]\n---\n',
      },
      'map',
      'status'
    )
  ).toEqual([])
})

test('needs at least one word', async () => {
  await expect(found({}, '')).rejects.toThrow('usage: tasks find word...')
})

test('tasks find prints one line per hit and exits 0', async () => {
  await repo.write({'tasks/TASK-1.md': task('Map', 'todo')})
  const BIN = new URL('../bin/run.ts', import.meta.url).pathname
  expect((await run(BIN, ['find', 'MAP'], {cwd: repo.dir})).stdout).toBe(
    'TASK-1 todo Map\n'
  )
  await expect(run(BIN, ['find'], {cwd: repo.dir})).rejects.toMatchObject({
    code: 1,
    stderr: 'usage: tasks find word...\n',
  })
})
