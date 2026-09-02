import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs/promises'
import {tmpdir} from 'node:os'
import * as path from 'node:path'
import {indexedFileTable} from '../../src/drizzle/schema.ts'
import {DatabaseService} from '../../src/services/DatabaseService.ts'
import {LoggerService} from '../../src/services/LoggerService.ts'

describe('crawl', () => {
  let testDir: string
  let contentDir: string
  let dbPath: string

  beforeEach(async () => {
    LoggerService.configure({debug: false})

    // Create a temporary test directory
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'crawl-test'))

    contentDir = path.join(testDir, 'content')
    await fs.mkdir(contentDir, {recursive: true})

    // Create test database path
    dbPath = path.join(testDir, 'test.db')
  })

  afterEach(async () => {
    // Clean up test directory and database
    await fs.rm(testDir, {recursive: true, force: true})
  })

  describe('basic functionality', () => {
    it('indexes an empty directory', async () => {
      const {stdout, stderr} = await runCommand([
        'crawl',
        contentDir,
        '-d',
        dbPath,
      ])

      const db = new DatabaseService(dbPath)
      const files = await db.getDatabase().select().from(indexedFileTable)
      expect(files.length).to.equal(0)
    })

    it('indexes files in directory and subdirectories', async () => {
      // Create test files
      await fs.writeFile(path.join(contentDir, 'file1.txt'), 'test content 1')
      await fs.writeFile(path.join(contentDir, 'file2.txt'), 'test content 2')
      await fs.mkdir(path.join(contentDir, 'subdir'))
      await fs.writeFile(
        path.join(contentDir, 'subdir', 'file3.txt'),
        'test content 3'
      )

      await runCommand(['crawl', contentDir, '-d', dbPath])

      const db = new DatabaseService(dbPath)
      const fileCount = await db.countFiles()
      expect(fileCount).to.equal(3)
    })
  })

  describe('file filtering', () => {
    it('respects ignore file', async () => {
      await fs.writeFile(path.join(contentDir, 'file1.txt'), 'test content 1')
      await fs.writeFile(path.join(contentDir, '.gitignore'), 'file2.txt')
      await fs.writeFile(path.join(contentDir, 'file2.txt'), 'test content 2')

      await runCommand([
        'crawl',
        contentDir,
        '-d',
        dbPath,
        '-i',
        '.gitignore',
        '--debug',
      ])

      const db = new DatabaseService(dbPath)
      const fileCount = await db.countFiles()
      expect(fileCount).to.equal(1) // does not include .gitignore nor file2.txt
    })
  })

  describe('limits', () => {
    it('respects file limit', async () => {
      await fs.writeFile(path.join(contentDir, 'file1.txt'), 'test content 1')
      await fs.writeFile(path.join(contentDir, 'file2.txt'), 'test content 2')

      await runCommand(['crawl', contentDir, '-d', dbPath, '-l', '1'])

      const db = new DatabaseService(dbPath)
      const fileCount = await db.countFiles()
      expect(fileCount).to.equal(1)
    })
  })

  describe('logging', () => {
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
      expect(stdout).to.contain('debug')
    })

    it('writes logs to specified folder', async () => {
      const logDir = path.join(testDir, 'logs')
      await fs.mkdir(logDir)
      await fs.writeFile(path.join(contentDir, 'file1.txt'), 'test content 1')

      await runCommand([
        'crawl',
        contentDir,
        '-d',
        dbPath,
        '--logFolder',
        path.join(testDir, 'logs'),
      ])

      const logFiles = await fs.readdir(path.join(contentDir, 'logs'))
      expect(logFiles.length).to.be.greaterThan(0)
      expect(logFiles[0]).to.match(/indexer-\d{4}-\d{2}-\d{2}\.log/)
    })
  })

  describe('error handling', () => {
    it('handles nonexistent directory gracefully', async () => {
      try {
        await runCommand(['crawl', 'nonexistent-directory', '-d', dbPath])
        throw new Error('Should have failed')
      } catch (error: unknown) {
        if (error instanceof Error) {
          expect(error.message).to.contain('ENOENT')
        } else {
          throw error
        }
      }
    })

    it('handles permission errors gracefully', async () => {
      // Create a file with no read permissions
      await fs.writeFile(path.join(contentDir, 'no-access.txt'), 'test content')
      await fs.chmod(path.join(contentDir, 'no-access.txt'), 0o000)

      await runCommand(['crawl', contentDir, '-d', dbPath])

      const db = new DatabaseService(dbPath)
      const fileCount = await db.countFiles()
      expect(fileCount).to.equal(1) // File is still indexed even if not readable
    })

    it('handles invalid symlinks gracefully', async () => {
      // Create a symlink that points to itself (invalid)
      await fs
        .symlink(
          path.join(contentDir, 'invalid-symlink'),
          path.join(contentDir, 'invalid-symlink')
        )
        .catch(() => {
          /* ignore error */
        })

      await runCommand(['crawl', contentDir, '-d', dbPath])

      const db = new DatabaseService(dbPath)
      const fileCount = await db.countFiles()
      expect(fileCount).to.equal(0)
    })

    it('handles corrupted database gracefully', async () => {
      await fs.writeFile(path.join(contentDir, 'file1.txt'), 'test content 1')
      await fs.writeFile(dbPath, 'invalid database content')

      try {
        await runCommand(['crawl', contentDir, '-d', dbPath])
        throw new Error('Should have failed')
      } catch (error: unknown) {
        if (error instanceof Error) {
          expect(error.message).to.contain('database')
        } else {
          throw error
        }
      }
    })
  })
})
