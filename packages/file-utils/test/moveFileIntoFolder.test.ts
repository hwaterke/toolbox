import {promises as fsPromises} from 'node:fs'
import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import {moveFileIntoFolder} from '../src/moveFileIntoFolder.ts'
import {
  listFilesRecursive,
  makeTempDir,
  pathExists,
  rmTree,
  seedTree,
} from './utils/fileTree.ts'

let root: string

beforeEach(async () => {
  root = await makeTempDir()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rmTree(root)
})

describe('moveFileIntoFolder', () => {
  test('moves a regular file into an existing folder', async () => {
    await seedTree(root, {
      src: {'note.txt': 'hello'},
      dest: {},
    })
    const source = path.join(root, 'src', 'note.txt')
    const dest = path.join(root, 'dest')

    const result = await moveFileIntoFolder(source, dest, {ifExists: 'skip'})

    expect(result).toEqual({
      moved: true,
      skipped: false,
      sourcePath: source,
      destinationPath: path.join(dest, 'note.txt'),
    })
    expect(await pathExists(source)).toBe(false)
    expect(await readFile(path.join(dest, 'note.txt'), 'utf8')).toBe('hello')
  })

  test('creates the destination folder recursively when missing', async () => {
    await seedTree(root, {'note.txt': 'hi'})
    const source = path.join(root, 'note.txt')
    const dest = path.join(root, 'new', 'nested', 'folder')

    const result = await moveFileIntoFolder(source, dest, {ifExists: 'skip'})

    expect(result.moved).toBe(true)
    expect(await pathExists(path.join(dest, 'note.txt'))).toBe(true)
  })

  test('throws when source is a symlink', async () => {
    await seedTree(root, {
      'target.txt': 'data',
      link: {__symlink: 'target.txt'},
      dest: {},
    })

    await expect(
      moveFileIntoFolder(path.join(root, 'link'), path.join(root, 'dest'), {
        ifExists: 'skip',
      })
    ).rejects.toThrow(/must not be a symlink/)
  })

  test('throws when source is a directory', async () => {
    await seedTree(root, {srcDir: {'inner.txt': 'x'}, dest: {}})

    await expect(
      moveFileIntoFolder(path.join(root, 'srcDir'), path.join(root, 'dest'), {
        ifExists: 'skip',
      })
    ).rejects.toThrow(/is not a file/)
  })

  test('propagates ENOENT when source does not exist', async () => {
    await expect(
      moveFileIntoFolder(path.join(root, 'missing.txt'), path.join(root, 'd'), {
        ifExists: 'skip',
      })
    ).rejects.toMatchObject({code: 'ENOENT'})
  })

  describe('ifExists: skip', () => {
    test('returns skipped result when destination exists', async () => {
      await seedTree(root, {
        src: {'note.txt': 'new'},
        dest: {'note.txt': 'old'},
      })
      const source = path.join(root, 'src', 'note.txt')
      const dest = path.join(root, 'dest')

      const result = await moveFileIntoFolder(source, dest, {ifExists: 'skip'})

      expect(result).toEqual({
        moved: false,
        skipped: true,
        sourcePath: source,
        destinationPath: path.join(dest, 'note.txt'),
        reason: 'destination_exists',
      })
      expect(await readFile(source, 'utf8')).toBe('new')
      expect(await readFile(path.join(dest, 'note.txt'), 'utf8')).toBe('old')
    })

    test('moves normally when destination does not exist', async () => {
      await seedTree(root, {src: {'note.txt': 'a'}, dest: {}})

      const result = await moveFileIntoFolder(
        path.join(root, 'src', 'note.txt'),
        path.join(root, 'dest'),
        {ifExists: 'skip'}
      )

      expect(result.moved).toBe(true)
    })
  })

  describe('ifExists: suffix', () => {
    test('first collision becomes name_1.ext', async () => {
      await seedTree(root, {
        src: {'note.txt': 'new'},
        dest: {'note.txt': 'old'},
      })

      const result = await moveFileIntoFolder(
        path.join(root, 'src', 'note.txt'),
        path.join(root, 'dest'),
        {ifExists: 'suffix'}
      )

      expect(result).toMatchObject({
        moved: true,
        destinationPath: path.join(root, 'dest', 'note_1.txt'),
      })
      expect(await readFile(path.join(root, 'dest', 'note.txt'), 'utf8')).toBe(
        'old'
      )
      expect(
        await readFile(path.join(root, 'dest', 'note_1.txt'), 'utf8')
      ).toBe('new')
    })

    test('skips occupied suffixes until one is free', async () => {
      await seedTree(root, {
        src: {'note.txt': 'new'},
        dest: {
          'note.txt': '0',
          'note_1.txt': '1',
          'note_2.txt': '2',
        },
      })

      const result = await moveFileIntoFolder(
        path.join(root, 'src', 'note.txt'),
        path.join(root, 'dest'),
        {ifExists: 'suffix'}
      )

      expect(result).toMatchObject({
        moved: true,
        destinationPath: path.join(root, 'dest', 'note_3.txt'),
      })
    })

    test('handles files with no extension', async () => {
      await seedTree(root, {
        src: {note: 'new'},
        dest: {note: 'old'},
      })

      const result = await moveFileIntoFolder(
        path.join(root, 'src', 'note'),
        path.join(root, 'dest'),
        {ifExists: 'suffix'}
      )

      expect(result).toMatchObject({
        moved: true,
        destinationPath: path.join(root, 'dest', 'note_1'),
      })
    })

    test('handles dotfiles (no basename, only extension per path rules)', async () => {
      // path.extname('.env') === '' and basename === '.env',
      // so a collision becomes '.env_1'
      await seedTree(root, {
        src: {'.env': 'new'},
        dest: {'.env': 'old'},
      })

      const result = await moveFileIntoFolder(
        path.join(root, 'src', '.env'),
        path.join(root, 'dest'),
        {ifExists: 'suffix'}
      )

      expect(result).toMatchObject({
        moved: true,
        destinationPath: path.join(root, 'dest', '.env_1'),
      })
    })
  })

  describe('cross-device fallback (EXDEV)', () => {
    test('falls back to copy+verify+unlink on EXDEV', async () => {
      await seedTree(root, {src: {'note.txt': 'cross-dev'}, dest: {}})
      const source = path.join(root, 'src', 'note.txt')
      const dest = path.join(root, 'dest')

      const exdev = Object.assign(new Error('EXDEV'), {code: 'EXDEV'})
      const renameSpy = vi
        .spyOn(fsPromises, 'rename')
        .mockRejectedValueOnce(exdev)

      const result = await moveFileIntoFolder(source, dest, {ifExists: 'skip'})

      expect(renameSpy).toHaveBeenCalledTimes(1)
      expect(result.moved).toBe(true)
      expect(await pathExists(source)).toBe(false)
      expect(await readFile(path.join(dest, 'note.txt'), 'utf8')).toBe(
        'cross-dev'
      )
    })

    test('size-mismatch path: throws and removes the destination', async () => {
      await seedTree(root, {src: {'note.txt': 'original-content'}, dest: {}})
      const source = path.join(root, 'src', 'note.txt')
      const dest = path.join(root, 'dest')

      vi.spyOn(fsPromises, 'rename').mockRejectedValueOnce(
        Object.assign(new Error('EXDEV'), {code: 'EXDEV'})
      )
      vi.spyOn(fsPromises, 'copyFile').mockImplementationOnce(
        async (_src, destPath) => {
          await fsPromises.writeFile(destPath as string, 'short')
        }
      )

      await expect(
        moveFileIntoFolder(source, dest, {ifExists: 'skip'})
      ).rejects.toThrow(/size mismatch/)
      expect(await pathExists(path.join(dest, 'note.txt'))).toBe(false)
      expect(await pathExists(source)).toBe(true)
    })

    test('hash-mismatch path: throws and removes the destination', async () => {
      const content = 'a'.repeat(16)
      await seedTree(root, {src: {'note.txt': content}, dest: {}})
      const source = path.join(root, 'src', 'note.txt')
      const dest = path.join(root, 'dest')

      vi.spyOn(fsPromises, 'rename').mockRejectedValueOnce(
        Object.assign(new Error('EXDEV'), {code: 'EXDEV'})
      )
      vi.spyOn(fsPromises, 'copyFile').mockImplementationOnce(
        async (_src, destPath) => {
          // Same length, different bytes — bypasses size check, fails hash check
          await fsPromises.writeFile(destPath as string, 'b'.repeat(16))
        }
      )

      await expect(
        moveFileIntoFolder(source, dest, {ifExists: 'skip'})
      ).rejects.toThrow(/hash mismatch/)
      expect(await pathExists(path.join(dest, 'note.txt'))).toBe(false)
      expect(await pathExists(source)).toBe(true)
    })

    test('non-EXDEV rename errors propagate unchanged', async () => {
      await seedTree(root, {src: {'note.txt': 'x'}, dest: {}})
      const source = path.join(root, 'src', 'note.txt')
      const dest = path.join(root, 'dest')

      const eacces = Object.assign(new Error('boom'), {code: 'EACCES'})
      vi.spyOn(fsPromises, 'rename').mockRejectedValueOnce(eacces)

      await expect(
        moveFileIntoFolder(source, dest, {ifExists: 'skip'})
      ).rejects.toMatchObject({code: 'EACCES'})
      expect(await pathExists(source)).toBe(true)
    })
  })

  describe('dryRun', () => {
    test('reports the move it would make and leaves the tree untouched', async () => {
      await seedTree(root, {src: {'note.txt': 'hello'}})
      const source = path.join(root, 'src', 'note.txt')
      const dest = path.join(root, 'new', 'nested')
      const before = await listFilesRecursive(root)

      const result = await moveFileIntoFolder(source, dest, {
        ifExists: 'skip',
        dryRun: true,
      })

      expect(result).toEqual({
        moved: true,
        skipped: false,
        sourcePath: source,
        destinationPath: path.join(dest, 'note.txt'),
      })
      expect(await listFilesRecursive(root)).toEqual(before)
      expect(await readFile(source, 'utf8')).toBe('hello')
      expect(await pathExists(path.join(root, 'new'))).toBe(false)
    })

    test('performs no filesystem writes', async () => {
      await seedTree(root, {src: {'note.txt': 'hello'}, dest: {}})
      const mkdirSpy = vi.spyOn(fsPromises, 'mkdir')
      const renameSpy = vi.spyOn(fsPromises, 'rename')
      const copyFileSpy = vi.spyOn(fsPromises, 'copyFile')
      const unlinkSpy = vi.spyOn(fsPromises, 'unlink')

      await moveFileIntoFolder(
        path.join(root, 'src', 'note.txt'),
        path.join(root, 'dest'),
        {ifExists: 'skip', dryRun: true}
      )

      expect(mkdirSpy).not.toHaveBeenCalled()
      expect(renameSpy).not.toHaveBeenCalled()
      expect(copyFileSpy).not.toHaveBeenCalled()
      expect(unlinkSpy).not.toHaveBeenCalled()
    })

    test('reports destination_exists under ifExists: skip', async () => {
      await seedTree(root, {
        src: {'note.txt': 'new'},
        dest: {'note.txt': 'old'},
      })
      const source = path.join(root, 'src', 'note.txt')
      const dest = path.join(root, 'dest')

      const result = await moveFileIntoFolder(source, dest, {
        ifExists: 'skip',
        dryRun: true,
      })

      expect(result).toEqual({
        moved: false,
        skipped: true,
        sourcePath: source,
        destinationPath: path.join(dest, 'note.txt'),
        reason: 'destination_exists',
      })
      expect(await readFile(source, 'utf8')).toBe('new')
      expect(await readFile(path.join(dest, 'note.txt'), 'utf8')).toBe('old')
    })

    test('reports the free suffixed path without creating it', async () => {
      await seedTree(root, {
        src: {'note.txt': 'new'},
        dest: {'note.txt': '0', 'note_1.txt': '1'},
      })

      const result = await moveFileIntoFolder(
        path.join(root, 'src', 'note.txt'),
        path.join(root, 'dest'),
        {ifExists: 'suffix', dryRun: true}
      )

      expect(result).toMatchObject({
        moved: true,
        destinationPath: path.join(root, 'dest', 'note_2.txt'),
      })
      expect(await pathExists(path.join(root, 'dest', 'note_2.txt'))).toBe(
        false
      )
    })

    test('still refuses a symlink source', async () => {
      await seedTree(root, {
        'target.txt': 'data',
        link: {__symlink: 'target.txt'},
      })

      await expect(
        moveFileIntoFolder(path.join(root, 'link'), path.join(root, 'dest'), {
          ifExists: 'skip',
          dryRun: true,
        })
      ).rejects.toThrow(/must not be a symlink/)
    })

    test('dryRun: false moves for real', async () => {
      await seedTree(root, {src: {'note.txt': 'hello'}, dest: {}})
      const source = path.join(root, 'src', 'note.txt')
      const dest = path.join(root, 'dest')

      const result = await moveFileIntoFolder(source, dest, {
        ifExists: 'skip',
        dryRun: false,
      })

      expect(result.moved).toBe(true)
      expect(await pathExists(source)).toBe(false)
      expect(await readFile(path.join(dest, 'note.txt'), 'utf8')).toBe('hello')
    })
  })
})
