import {constants, promises as FS} from 'node:fs'

export const TZ_OFFSET_REGEX = /^[+-]\d{2}:\d{2}$/
export const EXIF_DATE_TIME_REGEX = /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/
export const EXIF_DATE_TIME_WITH_TZ_REGEX =
  /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/
export const EXIF_DATE_TIME_WITH_UTC_REGEX =
  /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}Z$/
export const EXIF_DATE_TIME_SUBSEC_REGEX =
  /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}\.\d{2}$/
export const EXIF_DATE_TIME_SUBSEC2_WITH_TZ_REGEX =
  /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}\.\d{2}[+-]\d{2}:\d{2}$/
export const EXIF_DATE_TIME_SUBSEC3_WITH_TZ_REGEX =
  /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/

export const EXIF_DATE_TIME_FORMAT = 'yyyy:MM:dd HH:mm:ss'
export const EXIF_DATE_TIME_FORMAT_WITH_TZ = 'yyyy:MM:dd HH:mm:ssZZ'
export const EXIF_DATE_TIME_SUBSEC_FORMAT = 'yyyy:MM:dd HH:mm:ss.uu'
export const EXIF_DATE_TIME_SUBSEC2_FORMAT_WITH_TZ = 'yyyy:MM:dd HH:mm:ss.uuZZ'
export const EXIF_DATE_TIME_SUBSEC3_FORMAT_WITH_TZ = 'yyyy:MM:dd HH:mm:ss.SSSZZ'
export const EXIF_OFFSET_FORMAT = 'ZZ'

/**
 * Returns true if the provided path is a directory
 */
export const isDirectory = async (path: string): Promise<boolean> => {
  const stat = await FS.lstat(path)
  return stat.isDirectory()
}

/**
 * Makes sure the provided path is a valid file
 */
export const ensureFileOrThrow = async (path: string): Promise<void> => {
  if (await isDirectory(path)) {
    throw new Error(`${path} is a directory and not a file`)
  }
  await FS.access(path, constants.F_OK)
}
