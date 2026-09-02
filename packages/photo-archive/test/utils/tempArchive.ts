import {promises as fs} from 'node:fs'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import nodePath from 'node:path'

export type TempTree = {
  root: string
  /** Absolute path for a repo-relative path inside the temp tree. */
  path: (...parts: string[]) => string
  file: (relativePath: string, contents?: string) => Promise<string>
  dir: (relativePath: string) => Promise<string>
  /** Every file under the tree, as relative paths with `/` separators. */
  list: (relativePath?: string) => Promise<string[]>
  read: (relativePath: string) => Promise<string>
  cleanup: () => Promise<void>
}

export async function makeTempTree(): Promise<TempTree> {
  const root = await fs.realpath(
    await mkdtemp(nodePath.join(tmpdir(), 'photo-archive-'))
  )

  const path = (...parts: string[]): string => nodePath.join(root, ...parts)

  const dir = async (relativePath: string): Promise<string> => {
    const target = path(relativePath)
    await fs.mkdir(target, {recursive: true})
    return target
  }

  const file = async (
    relativePath: string,
    contents = relativePath
  ): Promise<string> => {
    const target = path(relativePath)
    await fs.mkdir(nodePath.dirname(target), {recursive: true})
    await fs.writeFile(target, contents)
    return target
  }

  const list = async (relativePath = '.'): Promise<string[]> => {
    const base = path(relativePath)
    const out: string[] = []
    const walk = async (current: string): Promise<void> => {
      let entries
      try {
        entries = await fs.readdir(current, {withFileTypes: true})
      } catch {
        return
      }
      for (const entry of entries) {
        const child = nodePath.join(current, entry.name)
        if (entry.isDirectory()) {
          await walk(child)
        } else {
          out.push(nodePath.relative(base, child).split(nodePath.sep).join('/'))
        }
      }
    }
    await walk(base)
    return out.sort()
  }

  const read = (relativePath: string): Promise<string> =>
    fs.readFile(path(relativePath), 'utf8')

  return {
    root,
    path,
    file,
    dir,
    list,
    read,
    cleanup: () => rm(root, {recursive: true, force: true}),
  }
}
