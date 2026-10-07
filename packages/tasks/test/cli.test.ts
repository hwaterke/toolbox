import {execFile} from 'node:child_process'
import nodePath from 'node:path'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'
import {expect, test} from 'vitest'
import {USAGE} from '../src/cli.ts'
import {COMMAND_HELP, OVERVIEW} from '../src/help.ts'
import {makeTempRepo} from './utils/tempRepo.ts'

const run = promisify(execFile)
const BIN = nodePath.join(
  nodePath.dirname(fileURLToPath(import.meta.url)),
  '..',
  'bin',
  'run.ts'
)

test('no arguments prints the one-line usage and exits 1', async () => {
  const result = run(BIN, [])
  await expect(result).rejects.toMatchObject({
    code: 1,
    stdout: '',
    stderr: `${USAGE}\n`,
  })
})

test('--help, -h and help print the overview to stdout and exit 0', async () => {
  for (const args of [['--help'], ['-h'], ['help']]) {
    const {stdout, stderr} = await run(BIN, args)
    expect(stdout).toBe(`${OVERVIEW}\n`)
    expect(stderr).toBe('')
  }
})

test('every command has help, through --help, -h or help', async () => {
  for (const command of ['new', 'list', 'find', 'deps', 'check']) {
    const expected = `${COMMAND_HELP[command]}\n`
    expect(expected).toMatch(new RegExp(`^usage: tasks ${command}\\b`))
    expect((await run(BIN, [command, '--help'])).stdout).toBe(expected)
    expect((await run(BIN, [command, 'x', '-h'])).stdout).toBe(expected)
    expect((await run(BIN, ['help', command])).stdout).toBe(expected)
  }
})

test('--help after -- is a word, not a flag', async () => {
  const repo = await makeTempRepo()
  try {
    await repo.write({
      'tasks/TASK-1.md': '---\ntitle: Document --help\nstatus: todo\n---\n',
    })
    const {stdout} = await run(BIN, ['find', '--', '--help'], {cwd: repo.dir})
    expect(stdout).toBe('TASK-1 todo Document --help\n')
  } finally {
    await repo.cleanup()
  }
})

test('a reader that closes early ends list quietly', async () => {
  const repo = await makeTempRepo()
  try {
    // More output than a pipe buffers, so writes are still pending when the
    // reader closes.
    const files: Record<string, string> = {}
    for (let id = 1; id <= 2000; id++) {
      files[`tasks/TASK-${id}.md`] =
        `---\ntitle: Task ${id} with a title long enough to fill the pipe quickly\nstatus: todo\n---\n`
    }
    await repo.write(files)
    const {stdout, stderr} = await run(
      'sh',
      ['-c', '"$0" list | head -n 1', BIN],
      {cwd: repo.dir}
    )
    expect(stdout).toMatch(/^TASK-\d+ todo .*\n$/)
    expect(stderr).not.toContain('EPIPE')
    expect(stderr).toBe('')
  } finally {
    await repo.cleanup()
  }
})
