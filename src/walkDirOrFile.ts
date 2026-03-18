import ignore, {Ignore} from 'ignore'
import {lstat, opendir, readFile} from 'node:fs/promises'
import * as nodePath from 'node:path'
import {LoggerService} from './services/LoggerService.js'

type WalkCallback = (path: string) => Promise<{stop: boolean}>

type Options = {
  ignoreFileName: string | null
}

export class IgnoreManager {
  private ignoreStack: {ig: Ignore; path: string}[] = []
  private logger = LoggerService.getLogger()

  constructor(private readonly ignoreFileName: string | null) {}

  async addIgnoreFile(dirPath: string) {
    if (this.ignoreFileName === null) {
      return false
    }

    const ignoreFilePath = nodePath.join(dirPath, this.ignoreFileName)
    try {
      const ignoreFileContent = await readFile(ignoreFilePath, 'utf8')
      this.logger.debug(`Adding ignore file: ${ignoreFilePath}`)
      this.ignoreStack.push({
        ig: ignore().add(ignoreFileContent),
        path: dirPath,
      })
      return true
    } catch {
      // Ignore file not found errors
    }

    return false
  }

  popIgnoreFile() {
    this.logger.debug(`Popping ignore file`)
    this.ignoreStack.pop()
  }

  shouldIgnore(path: string, isDirectory: boolean) {
    for (const {ig, path: ignorePath} of this.ignoreStack) {
      if (path.startsWith(ignorePath)) {
        const relativePath = nodePath.relative(ignorePath, path)
        if (ig.ignores(isDirectory ? `${relativePath}/` : relativePath)) {
          this.logger.debug(`Ignoring ${path}`)
          return true
        }
      }
    }
    return false
  }
}

export const walkDirOrFile = async ({
  path,
  callback,
  options,
}: {
  path: string
  callback: WalkCallback
  options: Options
}): Promise<void> => {
  const ignoreManager = new IgnoreManager(options.ignoreFileName)

  const recursiveWalk = async (subPath: string): Promise<{stop: boolean}> => {
    const stats = await lstat(subPath)

    if (stats.isSymbolicLink()) {
      return {stop: false}
    }

    if (stats.isFile() && !ignoreManager.shouldIgnore(subPath, false)) {
      return await callback(subPath)
    }

    if (stats.isDirectory()) {
      // Check if the directory should be ignored
      if (ignoreManager.shouldIgnore(subPath, true)) {
        return {stop: false}
      }

      // Check if the directory has an ignore file
      const ignoreFileAdded = await ignoreManager.addIgnoreFile(subPath)

      const dir = await opendir(subPath)
      for await (const dirent of dir) {
        // Skip ignore file
        if (
          options.ignoreFileName !== null &&
          dirent.name === options.ignoreFileName
        ) {
          continue
        }

        const filepath = nodePath.join(subPath, dirent.name)
        const result = await recursiveWalk(filepath)
        if (result.stop) {
          return result
        }
      }

      if (ignoreFileAdded) {
        ignoreManager.popIgnoreFile()
      }
    }

    return {stop: false}
  }

  await recursiveWalk(path)
}
