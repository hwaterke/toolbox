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
describe('crawl log folder', () => {
  let testDir: string
  let contentDir: string
  let dbPath: string

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'crawl-logfolder-test'))
    contentDir = path.join(testDir, 'content')
    await fs.mkdir(contentDir, {recursive: true})
    dbPath = path.join(testDir, 'test.db')
  })

  afterEach(async () => {
    await fs.rm(testDir, {recursive: true, force: true})
  })

  it('writes logs to specified folder', async () => {
    const logDir = path.join(testDir, 'logs')
    await fs.mkdir(logDir)
    await fs.writeFile(path.join(contentDir, 'file1.txt'), 'test content 1')

    await runCommand(['crawl', contentDir, '-d', dbPath, '--logFolder', logDir])

    const logFiles = await fs.readdir(logDir)
    expect(logFiles.length).toBeGreaterThan(0)
    expect(logFiles[0]).toMatch(/indexer-\d{4}-\d{2}-\d{2}\.log/)
  })
})
