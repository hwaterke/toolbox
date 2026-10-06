import {mkdir} from 'node:fs/promises'
import nodePath from 'node:path'
import {afterEach, describe, expect, test} from 'vitest'
import {loadTasks} from '../src/load.ts'
import {findRoot} from '../src/repo.ts'
import {makeTempRepo, type TempRepo} from './utils/tempRepo.ts'

let repo: TempRepo

afterEach(async () => {
  await repo.cleanup()
})

describe('findRoot', () => {
  test('finds the top of the repo from a subdirectory', async () => {
    repo = await makeTempRepo()
    await mkdir(nodePath.join(repo.dir, 'a', 'b'), {recursive: true})
    expect(await findRoot(nodePath.join(repo.dir, 'a', 'b'))).toBe(repo.dir)
  })

  test('throws outside a repo', async () => {
    repo = await makeTempRepo({git: false})
    await expect(findRoot(repo.dir)).rejects.toThrow('not in a git repository')
  })
})

describe('loadTasks', () => {
  test('reads tasks/*.md in numeric order, frontmatter and body', async () => {
    repo = await makeTempRepo()
    await repo.write({
      'tasks/TASK-10.md':
        '---\ntitle: Ten\nstatus: todo\n---\n\n## Description\n',
      'tasks/TASK-2.md':
        '---\ntitle: Two\nstatus: idea\ndepends: [TASK-10]\nlabels: [world]\n---\n',
      'tasks/notes.txt': 'not a task',
    })
    expect(await loadTasks(repo.dir)).toEqual([
      {
        file: 'tasks/TASK-2.md',
        id: 'TASK-2',
        frontmatter: {
          title: 'Two',
          status: 'idea',
          depends: ['TASK-10'],
          labels: ['world'],
        },
        dependsLines: [4],
        body: '',
        problems: [],
      },
      {
        file: 'tasks/TASK-10.md',
        id: 'TASK-10',
        frontmatter: {title: 'Ten', status: 'todo'},
        dependsLines: [],
        body: '\n## Description\n',
        problems: [],
      },
    ])
  })

  test('a repo without tasks/ has no tasks', async () => {
    repo = await makeTempRepo()
    expect(await loadTasks(repo.dir)).toEqual([])
  })

  test('reads a quoted title with " #" and ": " unchanged', async () => {
    repo = await makeTempRepo()
    await repo.write({
      'tasks/TASK-1.md': "---\ntitle: 'Fix #3: the map'\nstatus: todo\n---\n",
    })
    const [task] = await loadTasks(repo.dir)
    expect(task).toMatchObject({
      frontmatter: {title: 'Fix #3: the map'},
      problems: [],
    })
  })
})
