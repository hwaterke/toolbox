import {execFile} from 'node:child_process'
import {mkdir, mkdtemp, realpath, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import nodePath from 'node:path'
import {promisify} from 'node:util'

export const run = promisify(execFile)

export type TempRepo = {
  dir: string
  write: (files: Record<string, string>) => Promise<void>
  cleanup: () => Promise<void>
}

/** A fresh directory, a git repo unless `git` is false. */
export async function makeTempRepo({git = true} = {}): Promise<TempRepo> {
  // realpath: on macOS the temp dir is a symlink, and git reports the real path.
  const dir = await realpath(await mkdtemp(nodePath.join(tmpdir(), 'tasks-')))
  if (git) await run('git', ['init', '-q'], {cwd: dir})
  return {
    dir,
    write: async (files) => {
      for (const [file, text] of Object.entries(files)) {
        const path = nodePath.join(dir, file)
        await mkdir(nodePath.dirname(path), {recursive: true})
        await writeFile(path, text)
      }
    },
    cleanup: () => rm(dir, {recursive: true, force: true}),
  }
}
