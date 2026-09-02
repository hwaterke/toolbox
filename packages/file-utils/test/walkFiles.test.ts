import path from 'node:path'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import {compareAsc, walkFiles} from '../src/walkFiles.ts'
import {makeTempDir, rmTree, seedTree} from './utils/fileTree.ts'

let root: string

beforeEach(async () => {
  root = await makeTempDir()
})

afterEach(async () => {
  await rmTree(root)
})

const collect = (): {
  callback: (p: string) => Promise<void>
  collected: string[]
} => {
  const collected: string[] = []
  return {
    collected,
    callback: async (p: string): Promise<void> => {
      collected.push(p)
    },
  }
}

describe('walkFiles - root validation', () => {
  test('throws when root is a symlink', async () => {
    await seedTree(root, {
      'target.txt': 'x',
      link: {__symlink: 'target.txt'},
    })
    const {callback} = collect()

    await expect(
      walkFiles({path: path.join(root, 'link'), callback})
    ).rejects.toThrow(/symbolic link/)
  })

  test('single-file root: callback invoked exactly once with that path', async () => {
    await seedTree(root, {'a.txt': 'hello'})
    const {callback, collected} = collect()

    await walkFiles({path: path.join(root, 'a.txt'), callback})

    expect(collected).toEqual([path.join(root, 'a.txt')])
  })

  test('single-file root with rejecting filter: callback never invoked', async () => {
    await seedTree(root, {'a.txt': 'hello'})
    const {callback, collected} = collect()

    await walkFiles({
      path: path.join(root, 'a.txt'),
      callback,
      filter: () => false,
    })

    expect(collected).toEqual([])
  })
})

describe('walkFiles - traversal', () => {
  test('visits every file recursively', async () => {
    await seedTree(root, {
      'a.txt': '1',
      sub: {'b.txt': '2', deep: {'c.txt': '3'}},
    })
    const {callback, collected} = collect()

    await walkFiles({path: root, callback})

    expect(collected.sort()).toEqual([
      path.join(root, 'a.txt'),
      path.join(root, 'sub', 'b.txt'),
      path.join(root, 'sub', 'deep', 'c.txt'),
    ])
  })

  test('default includeHidden: false skips dot-prefixed files and dirs', async () => {
    await seedTree(root, {
      'visible.txt': 'v',
      '.hidden.txt': 'h',
      '.hiddenDir': {'inside.txt': 'i'},
    })
    const {callback, collected} = collect()

    await walkFiles({path: root, callback})

    expect(collected).toEqual([path.join(root, 'visible.txt')])
  })

  test('includeHidden: true includes dotfiles and hidden dirs', async () => {
    await seedTree(root, {
      'visible.txt': 'v',
      '.hidden.txt': 'h',
      '.hiddenDir': {'inside.txt': 'i'},
    })
    const {callback, collected} = collect()

    await walkFiles({path: root, callback, includeHidden: true})

    expect(collected.sort()).toEqual([
      path.join(root, '.hidden.txt'),
      path.join(root, '.hiddenDir', 'inside.txt'),
      path.join(root, 'visible.txt'),
    ])
  })

  test('filter excludes matched files and prunes directories', async () => {
    await seedTree(root, {
      keep: {'a.txt': 'a'},
      drop: {'b.txt': 'b'},
      'top.txt': 't',
    })
    const {callback, collected} = collect()

    await walkFiles({
      path: root,
      callback,
      filter: (p) => !p.endsWith('drop') && !p.endsWith('top.txt'),
    })

    expect(collected).toEqual([path.join(root, 'keep', 'a.txt')])
  })

  test('async filter is awaited', async () => {
    await seedTree(root, {'a.txt': '1', 'b.txt': '2'})
    const {callback, collected} = collect()

    await walkFiles({
      path: root,
      callback,
      filter: async (p) => {
        await new Promise((r) => setTimeout(r, 1))
        return p.endsWith('a.txt')
      },
    })

    expect(collected).toEqual([path.join(root, 'a.txt')])
  })
})

describe('walkFiles - sorting', () => {
  test('buffered sort: callback receives files in sorted order with total set', async () => {
    await seedTree(root, {
      'c.txt': 'c',
      'a.txt': 'a',
      sub: {'b.txt': 'b'},
    })
    const {callback, collected} = collect()
    const seen: Array<{index: number; total: number | undefined}> = []

    await walkFiles({
      path: root,
      callback,
      sort: compareAsc,
      onFile: (_p, info) => seen.push(info),
    })

    expect(collected).toEqual([
      path.join(root, 'a.txt'),
      path.join(root, 'c.txt'),
      path.join(root, 'sub', 'b.txt'),
    ])
    expect(seen).toEqual([
      {index: 1, total: 3},
      {index: 2, total: 3},
      {index: 3, total: 3},
    ])
  })

  test('sortPerFolder: per-folder ordering with total undefined', async () => {
    await seedTree(root, {
      'c.txt': 'c',
      'a.txt': 'a',
      sub: {'z.txt': 'z', 'm.txt': 'm'},
    })
    const {callback, collected} = collect()
    const totals: Array<number | undefined> = []

    await walkFiles({
      path: root,
      callback,
      sort: compareAsc,
      sortPerFolder: true,
      onFile: (_p, info) => totals.push(info.total),
    })

    // Each folder's entries appear in sorted order.
    // Top-level entries: a.txt, c.txt, sub/ (recursed in place).
    expect(collected).toEqual([
      path.join(root, 'a.txt'),
      path.join(root, 'c.txt'),
      path.join(root, 'sub', 'm.txt'),
      path.join(root, 'sub', 'z.txt'),
    ])
    expect(totals).toEqual([undefined, undefined, undefined, undefined])
  })

  test('no sort: total is undefined', async () => {
    await seedTree(root, {'a.txt': '1'})
    const {callback} = collect()
    const totals: Array<number | undefined> = []

    await walkFiles({
      path: root,
      callback,
      onFile: (_p, info) => totals.push(info.total),
    })

    expect(totals).toEqual([undefined])
  })
})

describe('walkFiles - symlinks within tree', () => {
  test('symlink to file: target is processed under the symlink path', async () => {
    await seedTree(root, {
      'real.txt': 'real',
      link: {__symlink: 'real.txt'},
    })
    const {callback, collected} = collect()

    await walkFiles({path: root, callback})

    expect(collected.sort()).toEqual([
      path.join(root, 'link'),
      path.join(root, 'real.txt'),
    ])
  })

  test('symlink to directory: NOT recursed (only file targets handled)', async () => {
    await seedTree(root, {
      target: {'inside.txt': 'i'},
      link: {__symlink: 'target'},
    })
    const {callback, collected} = collect()

    await walkFiles({path: root, callback})

    expect(collected).toEqual([path.join(root, 'target', 'inside.txt')])
  })

  test('broken symlink: silently skipped', async () => {
    await seedTree(root, {
      'a.txt': 'a',
      broken: {__symlink: 'nonexistent'},
    })
    const {callback, collected} = collect()

    await walkFiles({path: root, callback})

    expect(collected).toEqual([path.join(root, 'a.txt')])
  })
})

describe('walkFiles - ignore files', () => {
  test('cascading .gitignore: nested rules apply only to that subtree', async () => {
    await seedTree(root, {
      '.gitignore': 'top-ignored.txt\n',
      'top-ignored.txt': 'x',
      'top-kept.txt': 'k',
      sub: {
        '.gitignore': 'nested-ignored.txt\n',
        'nested-ignored.txt': 'n',
        'nested-kept.txt': 'k',
      },
      other: {
        // top-level .gitignore says top-ignored.txt at root, this file should remain
        'nested-ignored.txt': 'still-here',
      },
    })
    const {callback, collected} = collect()

    await walkFiles({path: root, callback, ignoreFileName: '.gitignore'})

    expect(collected.sort()).toEqual([
      path.join(root, 'other', 'nested-ignored.txt'),
      path.join(root, 'sub', 'nested-kept.txt'),
      path.join(root, 'top-kept.txt'),
    ])
  })

  test('the ignore file itself is never reported', async () => {
    await seedTree(root, {
      '.gitignore': '',
      'a.txt': 'a',
    })
    const {callback, collected} = collect()

    await walkFiles({path: root, callback, ignoreFileName: '.gitignore'})

    expect(collected).toEqual([path.join(root, 'a.txt')])
  })

  test('ignored directory is pruned', async () => {
    await seedTree(root, {
      '.gitignore': 'skipme/\n',
      skipme: {'a.txt': 'a', 'b.txt': 'b'},
      keep: {'c.txt': 'c'},
    })
    const {callback, collected} = collect()

    await walkFiles({path: root, callback, ignoreFileName: '.gitignore'})

    expect(collected).toEqual([path.join(root, 'keep', 'c.txt')])
  })
})

describe('walkFiles - error handling', () => {
  test("'continue' (default): all files attempted, AggregateError thrown at end", async () => {
    await seedTree(root, {'a.txt': 'a', 'b.txt': 'b', 'c.txt': 'c'})
    const seen: string[] = []
    const onError = vi.fn()

    await expect(
      walkFiles({
        path: root,
        callback: async (p) => {
          seen.push(p)
          throw new Error(`boom: ${path.basename(p)}`)
        },
        onError,
      })
    ).rejects.toBeInstanceOf(AggregateError)

    expect(seen).toHaveLength(3)
    expect(onError).toHaveBeenCalledTimes(3)
  })

  test("'stop': throws on first failure, no further callbacks", async () => {
    await seedTree(root, {
      'a.txt': 'a',
      'b.txt': 'b',
      'c.txt': 'c',
    })
    const seen: string[] = []

    await expect(
      walkFiles({
        path: root,
        callback: async (p) => {
          seen.push(p)
          throw new Error('boom')
        },
        onErrorMode: 'stop',
        sort: compareAsc, // deterministic ordering for the assertion
      })
    ).rejects.toThrow('boom')

    expect(seen).toEqual([path.join(root, 'a.txt')])
  })

  test('custom onError(err, path) is invoked', async () => {
    await seedTree(root, {'a.txt': 'a'})
    const onError = vi.fn()

    await expect(
      walkFiles({
        path: root,
        callback: async () => {
          throw new Error('x')
        },
        onError,
      })
    ).rejects.toBeInstanceOf(AggregateError)

    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      path.join(root, 'a.txt')
    )
  })
})

describe('walkFiles - AbortSignal', () => {
  test('pre-aborted signal: zero callback invocations', async () => {
    await seedTree(root, {'a.txt': 'a', 'b.txt': 'b'})
    const {callback, collected} = collect()
    const controller = new AbortController()
    controller.abort()

    await walkFiles({path: root, callback, signal: controller.signal})

    expect(collected).toEqual([])
  })

  test('abort from onFile after N files: exactly N callbacks fired', async () => {
    const tree: Record<string, string> = {}
    for (let i = 0; i < 10; i++)
      tree[`f${i.toString().padStart(2, '0')}.txt`] = `${i}`
    await seedTree(root, tree)
    const {callback, collected} = collect()
    const controller = new AbortController()

    await walkFiles({
      path: root,
      callback,
      sort: compareAsc,
      signal: controller.signal,
      onFile: (_p, info) => {
        if (info.index === 3) controller.abort()
      },
    })

    expect(collected).toHaveLength(3)
  })
})

describe('walkFiles - onFile progress info', () => {
  test('streaming: index increments from 1, total is undefined', async () => {
    await seedTree(root, {'a.txt': '', 'b.txt': '', 'c.txt': ''})
    const {callback} = collect()
    const seen: Array<{index: number; total: number | undefined}> = []

    await walkFiles({
      path: root,
      callback,
      sortPerFolder: true,
      sort: compareAsc,
      onFile: (_p, info) => seen.push(info),
    })

    expect(seen).toEqual([
      {index: 1, total: undefined},
      {index: 2, total: undefined},
      {index: 3, total: undefined},
    ])
  })

  test('buffered (with sort): total equals file count', async () => {
    await seedTree(root, {'a.txt': '', sub: {'b.txt': '', 'c.txt': ''}})
    const {callback} = collect()
    const seen: Array<{index: number; total: number | undefined}> = []

    await walkFiles({
      path: root,
      callback,
      sort: compareAsc,
      onFile: (_p, info) => seen.push(info),
    })

    expect(seen.map((s) => s.total)).toEqual([3, 3, 3])
    expect(seen.map((s) => s.index)).toEqual([1, 2, 3])
  })
})
