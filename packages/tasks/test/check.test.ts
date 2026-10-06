import {afterEach, beforeEach, describe, expect, test} from 'vitest'
import {check} from '../src/commands/check.ts'
import {makeTempRepo, run, type TempRepo} from './utils/tempRepo.ts'

let repo: TempRepo

beforeEach(async () => {
  repo = await makeTempRepo()
})

afterEach(async () => {
  await repo.cleanup()
})

/** The `check` lines for a repo holding just these task files. */
async function checkTasks(files: Record<string, string>): Promise<string[]> {
  await repo.write(files)
  return check(repo.dir)
}

test('valid tasks have no problems', async () => {
  expect(
    await checkTasks({
      'tasks/TASK-1.md': '---\ntitle: One\nstatus: done\n---\n',
      'tasks/TASK-2.md':
        '---\ntitle: Two\nstatus: idea\ndepends: [TASK-1]\nlabels: [world]\n---\n',
    })
  ).toEqual([])
})

describe('frontmatter', () => {
  test('parses', async () => {
    expect(
      await checkTasks({
        'tasks/TASK-1.md': '# Just a heading\n',
        'tasks/TASK-2.md': '---\ntitle: One\ntitle: Two\nstatus: todo\n---\n',
      })
    ).toEqual([
      'tasks/TASK-1.md:1 no frontmatter between --- lines',
      'tasks/TASK-2.md:3 Map keys must be unique',
    ])
  })

  test('is a map', async () => {
    expect(await checkTasks({'tasks/TASK-1.md': '---\n---\n'})).toEqual([
      'tasks/TASK-1.md:1 frontmatter is not a map',
    ])
  })

  test('has no unknown key', async () => {
    expect(
      await checkTasks({
        'tasks/TASK-1.md':
          '---\ntitle: One\nid: TASK-1\nstatus: todo\npriority: high\n---\n',
      })
    ).toEqual([
      'tasks/TASK-1.md:3 unknown key "id"',
      'tasks/TASK-1.md:5 unknown key "priority"',
    ])
  })

  test('has a known status', async () => {
    expect(
      await checkTasks({
        'tasks/TASK-1.md': '---\ntitle: One\nstatus: To Do\n---\n',
        'tasks/TASK-2.md': '---\ntitle: Two\n---\n',
      })
    ).toEqual([
      'tasks/TASK-1.md:3 status "To Do" is not idea|todo|doing|done|dropped',
      'tasks/TASK-2.md:1 missing status',
    ])
  })

  test('has a non-empty title', async () => {
    expect(
      await checkTasks({
        'tasks/TASK-1.md': "---\ntitle: '  '\nstatus: todo\n---\n",
        'tasks/TASK-2.md': '---\ntitle:\nstatus: todo\n---\n',
        'tasks/TASK-3.md': '---\nstatus: todo\n---\n',
        'tasks/TASK-4.md': '---\ntitle: 42\nstatus: todo\n---\n',
      })
    ).toEqual([
      'tasks/TASK-1.md:2 title is empty',
      'tasks/TASK-2.md:2 title is empty',
      'tasks/TASK-3.md:1 missing title',
      'tasks/TASK-4.md:2 title is not a string',
    ])
  })

  test('lists dependencies as TASK-n ids and labels as strings', async () => {
    expect(
      await checkTasks({
        'tasks/TASK-1.md':
          '---\ntitle: One\nstatus: todo\ndepends: [task-2, DRAFT-3]\nlabels:\n  - world\n  - 3\n---\n',
        'tasks/TASK-2.md':
          '---\ntitle: Two\nstatus: todo\ndepends: TASK-1\n---\n',
      })
    ).toEqual([
      'tasks/TASK-1.md:4 depends.0 "task-2" is not a TASK-n id',
      'tasks/TASK-1.md:4 depends.1 "DRAFT-3" is not a TASK-n id',
      'tasks/TASK-1.md:7 labels.1 is not a string',
      'tasks/TASK-2.md:4 depends is not an array',
    ])
  })

  test('lives in a file named TASK-n.md', async () => {
    expect(
      await checkTasks({
        'tasks/fix-map.md': '---\ntitle: One\nstatus: todo\n---\n',
        'tasks/TASK-007.md': '---\ntitle: Seven\nstatus: todo\n---\n',
      })
    ).toEqual([
      'tasks/fix-map.md:1 filename is not TASK-n.md',
      'tasks/TASK-007.md:1 filename is not TASK-n.md',
    ])
  })

  test('has no comment, which would cut an unquoted value short', async () => {
    expect(
      await checkTasks({
        'tasks/TASK-1.md': '---\ntitle: Fix #3\nstatus: todo\n---\n',
        'tasks/TASK-2.md': '---\n# owner: me\ntitle: Two\nstatus: todo\n---\n',
      })
    ).toEqual([
      'tasks/TASK-1.md:2 comment in frontmatter; quote a value containing " #"',
      'tasks/TASK-2.md:2 comment in frontmatter; quote a value containing " #"',
    ])
  })
})

describe('tasks check', () => {
  const BIN = new URL('../bin/run.ts', import.meta.url).pathname

  test('is silent and exits 0 when there is no problem', async () => {
    await repo.write({
      'tasks/TASK-1.md': '---\ntitle: One\nstatus: todo\n---\n',
    })
    const {stdout, stderr} = await run(BIN, ['check'], {cwd: repo.dir})
    expect([stdout, stderr]).toEqual(['', ''])
  })

  test('prints one line per problem and exits 1', async () => {
    await repo.write({
      'tasks/TASK-1.md': '---\ntitle: One\nstatus: later\n---\n',
    })
    await expect(run(BIN, ['check'], {cwd: repo.dir})).rejects.toMatchObject({
      code: 1,
      stdout:
        'tasks/TASK-1.md:3 status "later" is not idea|todo|doing|done|dropped\n',
      stderr: '',
    })
  })
})
