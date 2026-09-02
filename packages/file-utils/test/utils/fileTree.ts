import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

export type FileTree = {
  [name: string]: string | Uint8Array | FileTree | {__symlink: string}
}

export async function makeTempDir(
  prefix = 'file-utils-test-'
): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix))
}

export async function rmTree(root: string): Promise<void> {
  await rm(root, {recursive: true, force: true})
}

export async function seedTree(root: string, tree: FileTree): Promise<void> {
  await mkdir(root, {recursive: true})
  for (const [name, value] of Object.entries(tree)) {
    const target = path.join(root, name)
    if (typeof value === 'string' || value instanceof Uint8Array) {
      await writeFile(target, value)
    } else if (isSymlink(value)) {
      await symlink(value.__symlink, target)
    } else {
      await seedTree(target, value)
    }
  }
}

export async function listFilesRecursive(root: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, {withFileTypes: true})
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else {
        out.push(path.relative(root, full))
      }
    }
  }
  await walk(root)
  return out.sort()
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

function isSymlink(value: unknown): value is {__symlink: string} {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__symlink' in value &&
    typeof (value as {__symlink: unknown}).__symlink === 'string'
  )
}
