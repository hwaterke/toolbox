import {execFile} from 'node:child_process'
import {mkdir, mkdtemp, realpath, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import nodePath from 'node:path'
import {promisify} from 'node:util'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'
import {loadTasks} from '../src/load.ts'
import {findRoot} from '../src/repo.ts'

const run = promisify(execFile)

let dir: string

beforeEach(async () => {
  dir = await realpath(await mkdtemp(nodePath.join(tmpdir(), 'tasks-')))
})

afterEach(async () => {
  await rm(dir, {recursive: true, force: true})
})

async function write(files: Record<string, string>) {
  for (const [file, text] of Object.entries(files)) {
    await mkdir(nodePath.dirname(nodePath.join(dir, file)), {recursive: true})
    await writeFile(nodePath.join(dir, file), text)
  }
}

describe('findRoot', () => {
  test('finds the top of the repo from a subdirectory', async () => {
    await run('git', ['init', '-q'], {cwd: dir})
    await mkdir(nodePath.join(dir, 'a', 'b'), {recursive: true})
    expect(await findRoot(nodePath.join(dir, 'a', 'b'))).toBe(dir)
  })

  test('throws outside a repo', async () => {
    await expect(findRoot(dir)).rejects.toThrow('not in a git repository')
  })
})

describe('loadTasks', () => {
  test('reads tasks/*.md in numeric order, frontmatter and body', async () => {
    await write({
      'tasks/TASK-10.md':
        '---\ntitle: Ten\nstatus: todo\n---\n\n## Description\n',
      'tasks/TASK-2.md':
        '---\ntitle: Two\nstatus: idea\ndepends: [TASK-10]\nlabels: [world]\n---\n',
      'tasks/notes.txt': 'not a task',
    })
    expect(await loadTasks(dir)).toEqual([
      {
        file: 'tasks/TASK-2.md',
        body: '',
        ok: true,
        frontmatter: {
          title: 'Two',
          status: 'idea',
          depends: ['TASK-10'],
          labels: ['world'],
        },
      },
      {
        file: 'tasks/TASK-10.md',
        body: '\n## Description\n',
        ok: true,
        frontmatter: {title: 'Ten', status: 'todo'},
      },
    ])
  })

  test('a repo without tasks/ has no tasks', async () => {
    expect(await loadTasks(dir)).toEqual([])
  })

  test('reads a quoted title with " #" and ": " unchanged', async () => {
    await write({
      'tasks/TASK-1.md': "---\ntitle: 'Fix #3: the map'\nstatus: todo\n---\n",
    })
    const [task] = await loadTasks(dir)
    expect(task).toMatchObject({
      ok: true,
      frontmatter: {title: 'Fix #3: the map'},
    })
  })

  test('schema problems point at the line of the offending key', async () => {
    await write({
      'tasks/TASK-1.md':
        '---\ntitle: One\npriority: high\nstatus: later\nlabels:\n  - world\n  - 3\n---\n',
    })
    const [task] = await loadTasks(dir)
    expect(task).toMatchObject({ok: false})
    expect(task?.ok === false && task.problems.map((p) => p.line)).toEqual([
      3, 4, 7,
    ])
  })

  test('a missing key points at the opening ---', async () => {
    await write({'tasks/TASK-1.md': '---\ntitle: One\n---\n'})
    const [task] = await loadTasks(dir)
    expect(task).toMatchObject({ok: false, problems: [{line: 1}]})
  })

  test('a YAML error points at its line', async () => {
    await write({
      'tasks/TASK-1.md': '---\ntitle: One\ntitle: Two\nstatus: todo\n---\n',
    })
    const [task] = await loadTasks(dir)
    expect(task).toMatchObject({ok: false, problems: [{line: 3}]})
  })

  test('a file without frontmatter is a problem on line 1', async () => {
    await write({'tasks/TASK-1.md': '# Just a heading\n'})
    const [task] = await loadTasks(dir)
    expect(task).toMatchObject({ok: false, problems: [{line: 1}]})
  })
})
