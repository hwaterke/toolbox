import {lstat, opendir, readFile, stat} from 'node:fs/promises'
import nodePath from 'node:path'
import chalk from 'chalk'
import ignore, {type Ignore} from 'ignore'

/**
 * Minimal dirent-shape accepted by `filter`. Real Node `Dirent`s satisfy this
 * structurally, and the walker synthesises one for the single-file root case.
 */
export type WalkDirent = {
  name: string
  isFile: () => boolean
  isDirectory: () => boolean
  isSymbolicLink: () => boolean
}

export type WalkFilesOptions = {
  path: string

  callback: (path: string) => Promise<void>

  filter?: (path: string, dirent: WalkDirent) => boolean | Promise<boolean>

  includeHidden?: boolean

  sort?: (a: string, b: string) => number

  ignoreFileName?: string

  onFile?: (
    path: string,
    info: {index: number; total: number | undefined}
  ) => void

  onError?: (err: unknown, path: string) => void

  onErrorMode?: 'continue' | 'stop'

  signal?: AbortSignal
}

export const compareAsc = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0

export const compareDesc = (a: string, b: string): number => -compareAsc(a, b)

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov'])

export const videosLastComparator = (a: string, b: string): number => {
  const extA = nodePath.extname(a).toLowerCase()
  const extB = nodePath.extname(b).toLowerCase()
  const aIsVideo = VIDEO_EXTENSIONS.has(extA)
  const bIsVideo = VIDEO_EXTENSIONS.has(extB)
  if (aIsVideo && !bIsVideo) return 1
  if (bIsVideo && !aIsVideo) return -1
  return compareAsc(extA, extB) || compareAsc(a, b)
}

export const defaultProgressLogger =
  (log: (message: string) => void): NonNullable<WalkFilesOptions['onFile']> =>
  (path, info) => {
    if (info.total !== undefined) {
      log(`${info.index}/${info.total} - ${path}`)
    } else {
      log(`${info.index} - ${path}`)
    }
  }

const defaultOnError = (err: unknown, path: string): void => {
  console.error(chalk.red(`Error while processing file: ${path}: ${err}`))
}

class IgnoreManager {
  private ignoreStack: {ig: Ignore; path: string}[] = []

  constructor(private readonly ignoreFileName: string) {}

  async addIgnoreFile(dirPath: string): Promise<boolean> {
    const ignoreFilePath = nodePath.join(dirPath, this.ignoreFileName)
    try {
      const contents = await readFile(ignoreFilePath, 'utf8')
      this.ignoreStack.push({ig: ignore().add(contents), path: dirPath})
      return true
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      return false
    }
  }

  pop(): void {
    this.ignoreStack.pop()
  }

  shouldIgnore(path: string, isDirectory: boolean): boolean {
    for (const {ig, path: ignorePath} of this.ignoreStack) {
      if (!path.startsWith(ignorePath)) continue
      const relativePath = nodePath.relative(ignorePath, path)
      if (relativePath === '') continue
      if (ig.ignores(isDirectory ? `${relativePath}/` : relativePath)) {
        return true
      }
    }
    return false
  }
}

const syntheticDirent = (path: string, isFile: boolean): WalkDirent => ({
  name: nodePath.basename(path),
  isFile: () => isFile,
  isDirectory: () => !isFile,
  isSymbolicLink: () => false,
})

export const walkFiles = async (options: WalkFilesOptions): Promise<void> => {
  const {
    path: rootPath,
    callback,
    filter,
    includeHidden = false,
    sort,
    ignoreFileName,
    onFile,
    onError = defaultOnError,
    onErrorMode = 'continue',
    signal,
  } = options

  const rootStats = await lstat(rootPath)
  if (rootStats.isSymbolicLink()) {
    throw new Error(`${rootPath} is a symbolic link`)
  }
  if (!rootStats.isFile() && !rootStats.isDirectory()) {
    throw new Error(`${rootPath} is neither a file nor a directory`)
  }

  const ignoreManager = ignoreFileName
    ? new IgnoreManager(ignoreFileName)
    : null
  const useBuffer = sort !== undefined
  const buffered: string[] = []
  const errors: unknown[] = []
  let index = 0
  let total: number | undefined

  const isAborted = (): boolean => signal?.aborted === true

  const passesFilters = async (
    path: string,
    dirent: WalkDirent,
    isDirectory: boolean
  ): Promise<boolean> => {
    if (!includeHidden && dirent.name.startsWith('.')) return false
    if (ignoreManager?.shouldIgnore(path, isDirectory)) return false
    if (filter && !(await filter(path, dirent))) return false
    return true
  }

  const yieldFile = async (path: string): Promise<void> => {
    if (useBuffer) {
      buffered.push(path)
      return
    }
    await invokeCallback(path)
  }

  const invokeCallback = async (path: string): Promise<void> => {
    if (isAborted()) return
    index++
    onFile?.(path, {index, total})
    try {
      await callback(path)
    } catch (err) {
      onError(err, path)
      if (onErrorMode === 'stop') throw err
      errors.push(err)
    }
  }

  const walkDir = async (dirPath: string): Promise<void> => {
    if (isAborted()) return

    const ignoreFileAdded =
      (await ignoreManager?.addIgnoreFile(dirPath)) ?? false

    try {
      const dir = await opendir(dirPath)
      for await (const dirent of dir) {
        if (isAborted()) return

        if (ignoreFileName && dirent.name === ignoreFileName) continue

        const childPath = nodePath.join(dirPath, dirent.name)

        if (dirent.isSymbolicLink()) {
          let targetStats
          try {
            targetStats = await stat(childPath)
          } catch {
            continue
          }
          if (targetStats.isFile()) {
            if (await passesFilters(childPath, dirent, false)) {
              await yieldFile(childPath)
            }
          }
          continue
        }

        if (dirent.isDirectory()) {
          if (await passesFilters(childPath, dirent, true)) {
            await walkDir(childPath)
          }
        } else if (dirent.isFile()) {
          if (await passesFilters(childPath, dirent, false)) {
            await yieldFile(childPath)
          }
        }
      }
    } finally {
      if (ignoreFileAdded) ignoreManager?.pop()
    }
  }

  if (rootStats.isFile()) {
    const dirent = syntheticDirent(rootPath, true)
    if (filter && !(await filter(rootPath, dirent))) {
      return
    }
    await yieldFile(rootPath)
  } else {
    await walkDir(rootPath)
  }

  if (useBuffer) {
    buffered.sort(sort)
    total = buffered.length
    for (const p of buffered) {
      if (isAborted()) break
      await invokeCallback(p)
    }
  }

  if (onErrorMode === 'continue' && errors.length > 0) {
    throw new AggregateError(
      errors,
      `${errors.length} file(s) failed during walk`
    )
  }
}
