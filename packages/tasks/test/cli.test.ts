import {execFile} from 'node:child_process'
import nodePath from 'node:path'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'
import {expect, test} from 'vitest'
import {USAGE} from '../src/cli.ts'

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
