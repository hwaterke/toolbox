import {createHash} from 'node:crypto'
import {promises as fs} from 'node:fs'
import path from 'node:path'

type ExistingDestinationMode = 'skip' | 'suffix'

interface MoveFileOptions {
  /**
   * What to do if a file with the same name already exists in the destination folder.
   *
   * - "skip": do not move the file, return skipped result
   * - "suffix": move as "file_1.ext", "file_2.ext", etc.
   */
  ifExists: ExistingDestinationMode
}

type MoveFileResult =
  | {
      moved: true
      skipped: false
      sourcePath: string
      destinationPath: string
    }
  | {
      moved: false
      skipped: true
      sourcePath: string
      destinationPath: string
      reason: 'destination_exists'
    }

export async function moveFileIntoFolder(
  sourcePath: string,
  destinationFolder: string,
  options: MoveFileOptions
): Promise<MoveFileResult> {
  const sourceStat = await fs.lstat(sourcePath)

  if (sourceStat.isSymbolicLink()) {
    throw new Error(`Source must not be a symlink: ${sourcePath}`)
  }

  if (!sourceStat.isFile()) {
    throw new Error(`Source is not a file: ${sourcePath}`)
  }

  await fs.mkdir(destinationFolder, {recursive: true})

  const fileName = path.basename(sourcePath)

  let destinationPath = path.join(destinationFolder, fileName)

  if (options.ifExists === 'skip') {
    if (await pathExists(destinationPath)) {
      return {
        moved: false,
        skipped: true,
        sourcePath,
        destinationPath,
        reason: 'destination_exists',
      }
    }
  } else if (options.ifExists === 'suffix') {
    destinationPath = await getAvailableSuffixedPath(destinationPath)
  } else {
    throw new Error(
      `Unsupported ifExists option: ${options.ifExists satisfies never}`
    )
  }

  await moveAcrossDevicesSafe(sourcePath, destinationPath)

  return {
    moved: true,
    skipped: false,
    sourcePath,
    destinationPath,
  }
}

async function moveAcrossDevicesSafe(
  sourcePath: string,
  destinationPath: string
): Promise<void> {
  try {
    await fs.rename(sourcePath, destinationPath)
  } catch (error) {
    if (isNodeError(error) && error.code === 'EXDEV') {
      await fs.copyFile(sourcePath, destinationPath)
      await verifyFileCopy(sourcePath, destinationPath)
      await fs.unlink(sourcePath)
      return
    }

    throw error
  }
}

async function verifyFileCopy(
  sourcePath: string,
  destinationPath: string
): Promise<void> {
  const [srcStat, dstStat] = await Promise.all([
    fs.stat(sourcePath),
    fs.stat(destinationPath),
  ])

  if (srcStat.size !== dstStat.size) {
    await fs.unlink(destinationPath)
    throw new Error(
      `Cross-device copy verification failed (size mismatch): ${sourcePath} → ${destinationPath}`
    )
  }

  const [srcHash, dstHash] = await Promise.all([
    hashFile(sourcePath),
    hashFile(destinationPath),
  ])

  if (srcHash !== dstHash) {
    await fs.unlink(destinationPath)
    throw new Error(
      `Cross-device copy verification failed (hash mismatch): ${sourcePath} → ${destinationPath}`
    )
  }
}

async function hashFile(filePath: string): Promise<string> {
  const handle = await fs.open(filePath, 'r')
  const hash = createHash('sha256')
  try {
    const stream = handle.createReadStream()
    for await (const chunk of stream) {
      hash.update(chunk)
    }
    return hash.digest('hex')
  } finally {
    await handle.close()
  }
}

async function getAvailableSuffixedPath(originalPath: string): Promise<string> {
  if (!(await pathExists(originalPath))) {
    return originalPath
  }

  const directory = path.dirname(originalPath)
  const extension = path.extname(originalPath)
  const baseName = path.basename(originalPath, extension)

  let counter = 1

  while (true) {
    const candidatePath = path.join(
      directory,
      `${baseName}_${counter}${extension}`
    )

    if (!(await pathExists(candidatePath))) {
      return candidatePath
    }

    counter += 1
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
