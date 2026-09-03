import {constants, promises as fs} from 'node:fs'

/**
 * Returns true if the provided path is a directory.
 *
 * A path that does not exist, or that cannot be read, returns false instead of
 * throwing.
 */
export const isDirectory = async (path: string): Promise<boolean> => {
  try {
    return (await fs.stat(path)).isDirectory()
  } catch {
    return false
  }
}

/**
 * Makes sure the provided path is a valid file.
 *
 * Throws when the path is a directory or when it does not exist.
 */
export const ensureFile = async (path: string): Promise<void> => {
  if (await isDirectory(path)) {
    throw new Error(`${path} is a directory and not a file`)
  }
  await fs.access(path, constants.F_OK)
}
