import {promises as FS, constants} from 'node:fs'
import nodePath from 'node:path'
import {ExiftoolService} from '@hwaterke/media-probe'
import {DateTime} from 'luxon'

export const EXIF_DATE_TIME_FORMAT = 'yyyy:MM:dd HH:mm:ss'
export const EXIF_DATE_TIME_FORMAT_WITH_TZ = 'yyyy:MM:dd HH:mm:ssZZ'
export const EXIF_DATE_TIME_SUBSEC_FORMAT_WITH_TZ = 'yyyy:MM:dd HH:mm:ss.uuZZ'
export const EXIF_OFFSET_FORMAT = 'ZZ'

/**
 * Returns true if the provided path is a directory
 */
export const isDirectory = async (path: string) => {
  const stat = await FS.lstat(path)
  return stat.isDirectory()
}

/**
 * Makes sure the provided path is a valid directory
 */
export const ensureDirectory = async (path: string): Promise<void> => {
  if (!(await isDirectory(path))) {
    throw new Error(`${path} is not a directory`)
  }
  await FS.access(path, constants.R_OK)
}

/**
 * Makes sure the provided path is a valid file
 */
export const ensureFile = async (path: string): Promise<void> => {
  if (await isDirectory(path)) {
    throw new Error(`${path} is a directory and not a file`)
  }
  await FS.access(path, constants.F_OK)
}

export const updateTime = async ({
  path,
  ext,
  time,
  exifService,
  dryRun,
}: {
  path: string
  ext: string
  time: DateTime
  exifService: ExiftoolService
  dryRun: boolean
}) => {
  if (['.MOV', '.MP4'].includes(ext)) {
    const timeString = time.toFormat(EXIF_DATE_TIME_FORMAT_WITH_TZ)
    await exifService.setQuickTimeCreationDate(path, timeString, {
      override: true,
      ignoreMinorErrors: true,
      dryRun,
    })
    await exifService.setAllTime(path, timeString, {
      override: true,
      ignoreMinorErrors: true,
      file: false,
      dryRun,
    })
    return
  }

  if (['.DNG', '.JPG', '.NEF', '.PNG'].includes(ext)) {
    const timeString =
      time.millisecond === 0
        ? time.toFormat(EXIF_DATE_TIME_FORMAT_WITH_TZ)
        : time.toFormat(EXIF_DATE_TIME_SUBSEC_FORMAT_WITH_TZ)
    const offsetString = time.toFormat(EXIF_OFFSET_FORMAT)
    await exifService.setTimezoneOffsets(path, offsetString, {
      ignoreMinorErrors: true,
      override: true,
      dryRun,
    })
    await exifService.setAllTime(path, timeString, {
      override: true,
      ignoreMinorErrors: true,
      file: false,
      dryRun,
    })
    return
  }

  throw new Error('Unsupported file type')
}

/**
 * Moves a file to a destination directory, ensuring no existing files are overwritten.
 * If a file with the same name exists, appends a counter suffix.
 * @param sourcePath - The source file path
 * @param destinationDir - The destination directory
 * @param dryRun - If true, doesn't actually move the file
 * @returns The final destination path
 */
export const moveFileSafely = async (
  sourcePath: string,
  destinationDir: string,
  dryRun: boolean
): Promise<string> => {
  await ensureFile(sourcePath)

  // Ensure destination directory exists
  await FS.mkdir(destinationDir, {recursive: true})

  const {name: baseName, ext} = nodePath.parse(sourcePath)
  let counter = 0

  // Find a unique filename
  while (true) {
    const fileName = `${baseName}${counter > 0 ? `_${counter}` : ''}${ext}`
    const destinationPath = nodePath.join(destinationDir, fileName)

    try {
      await FS.access(destinationPath, constants.F_OK)
      // File exists, try next counter
      counter += 1
    } catch {
      // File doesn't exist, we can use this path
      if (!dryRun) {
        // Use copy + delete instead of rename to support cross-volume moves
        await FS.copyFile(sourcePath, destinationPath)
        await FS.unlink(sourcePath)
      }
      return destinationPath
    }
  }
}
