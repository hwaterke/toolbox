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

/**
 * A task file with this status and these dependencies, as a block list. A
 * dropped one gets a reason, which the body rules ask for.
 */
const task = (status: string, ...depends: string[]) =>
  `---\ntitle: A task\nstatus: ${status}\n` +
  (depends.length > 0
    ? `depends:\n${depends.map((d) => `  - ${d}\n`).join('')}`
    : '') +
  '---\n' +
  (status === 'dropped' ? '\nNo longer wanted.\n' : '')

describe('graph', () => {
  test('allows closed tasks under a done one, and dropped under dropped', async () => {
    expect(
      await checkTasks({
        'tasks/TASK-1.md': task('done'),
        'tasks/TASK-2.md': task('dropped', 'TASK-3'),
        'tasks/TASK-3.md': task('dropped'),
        'tasks/TASK-4.md': task('done', 'TASK-1', 'TASK-2'),
        'tasks/TASK-5.md': task('todo', 'TASK-1', 'TASK-4'),
      })
    ).toEqual([])
  })

  test('dependencies exist', async () => {
    expect(
      await checkTasks({
        'tasks/TASK-1.md': task('todo', 'TASK-2', 'TASK-9'),
        'tasks/TASK-2.md': task('todo'),
      })
    ).toEqual(['tasks/TASK-1.md:6 depends on TASK-9, which does not exist'])
  })

  test('no task depends on itself', async () => {
    expect(
      await checkTasks({'tasks/TASK-1.md': task('todo', 'TASK-1')})
    ).toEqual(['tasks/TASK-1.md:5 depends on itself'])
  })

  test('no cycle, each reported once where it closes', async () => {
    expect(
      await checkTasks({
        'tasks/TASK-1.md': task('todo', 'TASK-2'),
        'tasks/TASK-2.md': task('todo', 'TASK-3'),
        'tasks/TASK-3.md': task('todo', 'TASK-1'),
        'tasks/TASK-4.md': task('todo', 'TASK-1', 'TASK-5'),
        'tasks/TASK-5.md': task('todo', 'TASK-4'),
      })
    ).toEqual([
      'tasks/TASK-3.md:5 dependency cycle TASK-1 -> TASK-2 -> TASK-3 -> TASK-1',
      'tasks/TASK-5.md:5 dependency cycle TASK-4 -> TASK-5 -> TASK-4',
    ])
  })

  test('a done task has no open dependency', async () => {
    expect(
      await checkTasks({
        'tasks/TASK-1.md': task('done', 'TASK-2', 'TASK-3', 'TASK-4'),
        'tasks/TASK-2.md': task('idea'),
        'tasks/TASK-3.md': task('doing'),
        'tasks/TASK-4.md': task('done'),
      })
    ).toEqual([
      'tasks/TASK-1.md:5 done, but depends on TASK-2, which is idea',
      'tasks/TASK-1.md:6 done, but depends on TASK-3, which is doing',
    ])
  })

  test('an open task does not depend on a dropped one', async () => {
    expect(
      await checkTasks({
        'tasks/TASK-1.md': task('idea', 'TASK-3'),
        'tasks/TASK-2.md': task('doing', 'TASK-3'),
        'tasks/TASK-3.md': task('dropped'),
      })
    ).toEqual([
      'tasks/TASK-1.md:5 depends on TASK-3, which is dropped',
      'tasks/TASK-2.md:5 depends on TASK-3, which is dropped',
    ])
  })

  test('a dependency on an invalid task file only reports that file', async () => {
    expect(
      await checkTasks({
        'tasks/TASK-1.md': task('todo', 'TASK-2'),
        'tasks/TASK-2.md': task('later'),
      })
    ).toEqual([
      'tasks/TASK-2.md:3 status "later" is not idea|todo|doing|done|dropped',
    ])
  })
})

describe('body', () => {
  const done = '---\ntitle: One\nstatus: done\n---\n'

  test('a done task has every acceptance criterion ticked', async () => {
    expect(
      await checkTasks({
        'tasks/TASK-1.md':
          done +
          '\n## Description\n\n- [ ] not a criterion\n\n' +
          '## Acceptance criteria\n\n- [x] Ticked\n- [ ] Not ticked\n  - [ ] Nested\n\n' +
          '### Still criteria\n\n* [ ] Starred\n\n' +
          '## Plan\n\n- [ ] 1.1 A step is not a criterion\n',
        'tasks/TASK-2.md':
          '---\ntitle: Two\nstatus: todo\n---\n\n## Acceptance criteria\n\n- [ ] Open\n',
      })
    ).toEqual([
      'tasks/TASK-1.md:13 done, but this criterion is not ticked',
      'tasks/TASK-1.md:14 done, but this criterion is not ticked',
      'tasks/TASK-1.md:18 done, but this criterion is not ticked',
    ])
  })

  test('a dropped task has a body saying why', async () => {
    expect(
      await checkTasks({
        'tasks/TASK-1.md': '---\ntitle: One\nstatus: dropped\n---\n',
        'tasks/TASK-2.md':
          '---\ntitle: Two\nstatus: dropped\n---\n\n## Description\n\n',
        'tasks/TASK-3.md':
          '---\ntitle: Three\nstatus: dropped\n---\n\nDropped: TASK-1 covers it.\n',
      })
    ).toEqual([
      'tasks/TASK-1.md:5 dropped, but no line in the body says why',
      'tasks/TASK-2.md:5 dropped, but no line in the body says why',
    ])
  })
})

describe('references', () => {
  const one = '---\ntitle: One\nstatus: todo\n---\n'

  test('every TASK-n in a task exists', async () => {
    expect(
      await checkTasks({
        'tasks/TASK-1.md':
          "---\ntitle: 'After TASK-8'\nstatus: todo\n---\n\nSee TASK-1 and TASK-9, TASK-9.\n",
      })
    ).toEqual([
      'tasks/TASK-1.md:2 TASK-8 does not exist',
      'tasks/TASK-1.md:6 TASK-9 does not exist',
    ])
  })

  test('a missing dependency is reported once, by the graph rule', async () => {
    expect(
      await checkTasks({
        'tasks/TASK-1.md':
          '---\ntitle: One\nstatus: todo\ndepends:\n  - TASK-8\nlabels: [TASK-7]\n---\n',
        'tasks/TASK-2.md':
          '---\ntitle: Two\nstatus: todo\ndepends: [TASK-9]\n---\n',
      })
    ).toEqual([
      'tasks/TASK-1.md:5 depends on TASK-8, which does not exist',
      'tasks/TASK-1.md:6 TASK-7 does not exist',
      'tasks/TASK-2.md:4 depends on TASK-9, which does not exist',
    ])
  })

  test('every TASK-n in the given files and directories exists', async () => {
    await repo.write({
      'tasks/TASK-1.md': one,
      'README.md': 'Done in TASK-1.\nTracked in tasks/TASK-2.md.\n',
      'docs/a.md': 'TASK-007\n',
      'docs/deep/b.md': '\nTASK-3\n',
      'docs/c.txt': 'TASK-4\n',
      'notes.txt': 'TASK-5\n',
    })
    expect(
      await check(repo.dir, [
        'README.md',
        'docs',
        'notes.txt',
        'tasks/TASK-1.md',
      ])
    ).toEqual([
      'README.md:2 TASK-2 does not exist',
      'docs/a.md:1 TASK-007 does not exist',
      'docs/deep/b.md:2 TASK-3 does not exist',
      'notes.txt:1 TASK-5 does not exist',
    ])
  })

  test('paths are relative to the working directory', async () => {
    await repo.write({'tasks/TASK-1.md': one, 'docs/a.md': 'TASK-2\n'})
    expect(await check(repo.dir, ['a.md'], `${repo.dir}/docs`)).toEqual([
      'docs/a.md:1 TASK-2 does not exist',
    ])
  })

  test('a wrongly cased id is an error', async () => {
    await repo.write({
      'tasks/TASK-1.md': one,
      'README.md': 'task-1, Task-1 and subtask-1\n',
    })
    expect(await check(repo.dir, ['README.md'])).toEqual([
      'README.md:1 task-1 is cased wrong; write TASK-1',
      'README.md:1 Task-1 is cased wrong; write TASK-1',
    ])
  })

  test('a DRAFT-n id, in any case, is an error', async () => {
    await repo.write({
      'tasks/TASK-1.md': one + '\nFrom DRAFT-3.\n',
      'README.md': 'draft-23\n',
    })
    expect(await check(repo.dir, ['README.md'])).toEqual([
      'tasks/TASK-1.md:6 DRAFT-3 is a draft id; drafts are now tasks with status idea',
      'README.md:1 draft-23 is a draft id; drafts are now tasks with status idea',
    ])
  })
})

describe('setup', () => {
  const one = '---\ntitle: One\nstatus: todo\n---\n'
  const finding =
    '.prettierignore:1 does not list tasks/, so prettier re-wraps task files'

  test('a repo with a prettier config lists tasks/ in .prettierignore', async () => {
    await repo.write({'tasks/TASK-1.md': one, '.prettierrc.json': '{}\n'})
    expect(await check(repo.dir)).toEqual([finding])
    await repo.write({
      '.prettierignore': 'node_modules\n# tasks/\ntasks/TASK-1.md\n',
    })
    expect(await check(repo.dir)).toEqual([finding])
  })

  test.each(['tasks', 'tasks/', '/tasks', '/tasks/', 'tasks/**', '  tasks/  '])(
    '"%s" in .prettierignore is enough',
    async (entry) => {
      await repo.write({
        'tasks/TASK-1.md': one,
        '.prettierrc': 'proseWrap: always\n',
        '.prettierignore': `node_modules\n${entry}\n`,
      })
      expect(await check(repo.dir)).toEqual([])
    }
  )

  test('prettier.config.* counts as a prettier config', async () => {
    await repo.write({
      'tasks/TASK-1.md': one,
      'prettier.config.js': 'export default {}\n',
    })
    expect(await check(repo.dir)).toEqual([finding])
  })

  test('a repo without a prettier config or without tasks/ needs nothing', async () => {
    await repo.write({'tasks/TASK-1.md': one})
    expect(await check(repo.dir)).toEqual([])
    await repo.write({'other/.prettierrc.json': '{}\n'})
    expect(await check(repo.dir)).toEqual([])

    const bare = await makeTempRepo()
    await bare.write({'.prettierrc.json': '{}\n'})
    expect(await check(bare.dir)).toEqual([])
    await bare.cleanup()
  })

  test('comes after the task problems', async () => {
    await repo.write({
      'tasks/TASK-1.md': '---\ntitle: One\nstatus: later\n---\n',
      '.prettierrc.json': '{}\n',
    })
    expect(await check(repo.dir)).toEqual([
      'tasks/TASK-1.md:3 status "later" is not idea|todo|doing|done|dropped',
      finding,
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

  test('a path that does not exist is a one-line error', async () => {
    await expect(
      run(BIN, ['check', 'nope.md'], {cwd: repo.dir})
    ).rejects.toMatchObject({
      code: 1,
      stdout: '',
      stderr: 'no such file: nope.md\n',
    })
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
