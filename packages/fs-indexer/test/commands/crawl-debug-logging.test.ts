import {runCommand} from '@oclif/test'
import * as fs from 'node:fs/promises'
import {tmpdir} from 'node:os'
import * as path from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

// oclif loads the command through its own import, so it holds a second copy of
// LoggerService that the test cannot reset. configure() is a one-shot, so the
// first runCommand in a file fixes the log level for every later one. Each
// logging assertion therefore needs a file of its own — vitest gives every test
// file a fresh module registry.
describe('crawl logging', () => {
  let testDir: string
  let contentDir: string
  let dbPath: string

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'crawl-debug-test'))
    contentDir = path.join(testDir, 'content')
    await fs.mkdir(contentDir, {recursive: true})
    dbPath = path.join(testDir, 'test.db')
  })

  afterEach(async () => {
    await fs.rm(testDir, {recursive: true, force: true})
  })

  it('enables debug logging', async () => {
    await fs.writeFile(path.join(contentDir, 'file1.txt'), 'test content 1')
    await fs.writeFile(path.join(contentDir, 'file2.txt'), 'test content 2')

    const {stdout} = await runCommand([
      'crawl',
      contentDir,
      '-d',
      dbPath,
      '--debug',
    ])
    expect(stdout).toContain('debug')
  })
})
