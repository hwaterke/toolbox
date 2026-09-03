import path from 'node:path'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'
import {ensureFile, isDirectory} from '../src/fsChecks.ts'
import {makeTempDir, rmTree, seedTree} from './utils/fileTree.ts'

let root: string

beforeEach(async () => {
  root = await makeTempDir()
})

afterEach(async () => {
  await rmTree(root)
})

describe('isDirectory', () => {
  test('is true for a folder', async () => {
    await seedTree(root, {events: {}})
    expect(await isDirectory(path.join(root, 'events'))).toBe(true)
  })

  test('is false for a file', async () => {
    await seedTree(root, {'note.txt': 'hello'})
    expect(await isDirectory(path.join(root, 'note.txt'))).toBe(false)
  })

  test('is false for a missing path', async () => {
    expect(await isDirectory(path.join(root, 'nope'))).toBe(false)
  })
})

describe('ensureFile', () => {
  test('accepts a regular file', async () => {
    await seedTree(root, {'note.txt': 'hello'})
    await expect(
      ensureFile(path.join(root, 'note.txt'))
    ).resolves.toBeUndefined()
  })

  test('throws on a folder', async () => {
    await seedTree(root, {events: {}})
    await expect(ensureFile(path.join(root, 'events'))).rejects.toThrow(
      'is a directory and not a file'
    )
  })

  test('throws on a missing path', async () => {
    await expect(ensureFile(path.join(root, 'nope'))).rejects.toThrow()
  })
})
