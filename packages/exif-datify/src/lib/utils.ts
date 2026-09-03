import {promises as FS, constants} from 'node:fs'
import {isDirectory} from '@hwaterke/file-utils'
import {ExiftoolService} from '@hwaterke/media-probe'
import {DateTime} from 'luxon'

export const EXIF_DATE_TIME_FORMAT = 'yyyy:MM:dd HH:mm:ss'
export const EXIF_DATE_TIME_FORMAT_WITH_TZ = 'yyyy:MM:dd HH:mm:ssZZ'
export const EXIF_DATE_TIME_SUBSEC_FORMAT_WITH_TZ = 'yyyy:MM:dd HH:mm:ss.uuZZ'
export const EXIF_OFFSET_FORMAT = 'ZZ'

/**
 * Makes sure the provided path is a valid directory
 */
export const ensureDirectory = async (path: string): Promise<void> => {
  if (!(await isDirectory(path))) {
    throw new Error(`${path} is not a directory`)
  }
  await FS.access(path, constants.R_OK)
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
