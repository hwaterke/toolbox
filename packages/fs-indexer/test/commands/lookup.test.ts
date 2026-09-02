import {runCommand} from '@oclif/test'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import * as fs from 'node:fs/promises'
import {tmpdir} from 'node:os'
import * as path from 'node:path'

describe('lookup command', () => {
  let testDir: string
  let dbPath: string

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'lookup-test'))
    dbPath = path.join(testDir, 'test.db')
  })

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, {recursive: true, force: true})
  })

  describe('help and flags', () => {
    it('shows help with originalPaths flag', async () => {
      const {stdout} = await runCommand(['lookup', '--help'])
      expect(stdout).toContain('--originalPaths')
      expect(stdout).toContain('comma-separated list of original paths')
    })

    it('accepts originalPaths flag', async () => {
      const {stderr} = await runCommand([
        'lookup',
        '/nonexistent/path',
        '--originalPaths',
        '/path1,/path2',
        '-d',
        dbPath,
      ])
      // Should not crash and should show some output
      expect(stderr).not.toContain('Error')
    })
  })
})
