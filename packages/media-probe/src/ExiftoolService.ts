import {execFile as callbackExecFile} from 'node:child_process'
import {promisify} from 'node:util'
import {ensureFile} from '@hwaterke/file-utils'
import {
  EXIF_DATE_TIME_FORMAT,
  EXIF_DATE_TIME_FORMAT_WITH_TZ,
  EXIF_DATE_TIME_REGEX,
  EXIF_DATE_TIME_SUBSEC2_FORMAT_WITH_TZ,
  EXIF_DATE_TIME_SUBSEC2_WITH_TZ_REGEX,
  EXIF_DATE_TIME_SUBSEC3_FORMAT_WITH_TZ,
  EXIF_DATE_TIME_SUBSEC3_WITH_TZ_REGEX,
  EXIF_DATE_TIME_SUBSEC_FORMAT,
  EXIF_DATE_TIME_SUBSEC_REGEX,
  EXIF_DATE_TIME_WITH_TZ_REGEX,
  EXIF_DATE_TIME_WITH_UTC_REGEX,
  TZ_OFFSET_REGEX,
} from './utils.ts'
import {EXIF_TAGS} from './types/ExiftoolMetadata.ts'
import type {ExiftoolMetadata} from './types/ExiftoolMetadata.ts'
import {DateTime} from 'luxon'
import type {Logger} from './types/Logger.ts'

const execFile = promisify(callbackExecFile)

const SHELL_SAFE_REGEX = /^[\w@%+=:,./-]+$/

/**
 * Arguments are passed to exiftool as an array, so no quoting is needed for
 * correctness. This only makes the command the logger prints copy-pasteable.
 */
const quoteForDisplay = (argument: string): string =>
  SHELL_SAFE_REGEX.test(argument)
    ? argument
    : `'${argument.replaceAll("'", String.raw`'\''`)}'`

export type ExiftoolServiceConfig = {
  logger?: Logger
}

export class ExiftoolService {
  private config: ExiftoolServiceConfig

  constructor(config: ExiftoolServiceConfig) {
    this.config = config
  }

  /**
   * Returns the exif metadata stored on the file provided
   */
  async extractExifMetadata(path: string): Promise<ExiftoolMetadata> {
    const rawResult = await this.exiftool({
      args: ['-G0:1', '-json'],
      path,
      options: {
        override: false,
        ignoreMinorErrors: false,
        dryRun: false,
      },
    })
    return JSON.parse(rawResult)[0]
  }

  /**
   * Returns the time related exif metadata stored on the file provided
   */
  async extractTimeExifMetadata(path: string): Promise<ExiftoolMetadata> {
    const rawResult = await this.exiftool({
      args: ['-Time:All', '-api', 'QuickTimeUTC', '-G0:1', '-json'],
      path,
      options: {
        override: false,
        ignoreMinorErrors: false,
        dryRun: false,
      },
    })
    return JSON.parse(rawResult)[0]
  }

  /**
   * Returns the time of capture from the exif metadata provided
   */
  extractDateTimeFromExif({
    metadata,
    timeZone,
    fileTimeFallback,
  }: {
    metadata: ExiftoolMetadata
    timeZone?: string
    fileTimeFallback: boolean
  }): {
    source: string
    raw: string
    iso: string
  } | null {
    const tags = [
      EXIF_TAGS.SUB_SEC_DATE_TIME_ORIGINAL,
      // Creation date is the ideal tag for videos as it contains the timezone offset.
      EXIF_TAGS.QUICKTIME_CREATION_DATE,
      EXIF_TAGS.DATE_TIME_ORIGINAL,
      EXIF_TAGS.GPS_DATE_TIME,
    ]
    for (const tag of tags) {
      const value = metadata[tag]
      if (value) {
        const parsed = this.parseDateTime({
          date: value,
          fallbackTimeZone: timeZone,
        })
        if (parsed && parsed.isValid) {
          return {
            source: tag,
            raw: value,
            iso: parsed.toISO()!,
          }
        }
      }
    }

    // CreateDate is not as good because it is stored in UTC (per specification).
    // Some companies still store local date time despite the spec e.g. GoPro
    const createDate = metadata[EXIF_TAGS.QUICKTIME_CREATE_DATE]
    if (createDate) {
      if (metadata[EXIF_TAGS.GOPRO_MODEL]) {
        const date = this.parseDateTime({
          date: createDate,
          fallbackTimeZone: timeZone,
        })
        if (date && date.isValid) {
          return {
            source: EXIF_TAGS.QUICKTIME_CREATE_DATE,
            raw: createDate,
            iso: date.toISO()!,
          }
        }
      } else {
        // Assuming UTC
        const date = this.parseDateTime({
          date: createDate,
          fallbackTimeZone: 'utc',
        })
        if (date && date.isValid) {
          const iso = timeZone
            ? date.setZone(timeZone).toISO()
            : date.toLocal().toISO()

          return {
            source: EXIF_TAGS.QUICKTIME_CREATE_DATE,
            raw: createDate,
            iso: iso!,
          }
        }
      }
    }

    if (fileTimeFallback) {
      const fileModifyDate = metadata[EXIF_TAGS.FILE_MODIFICATION_DATE]
      if (fileModifyDate) {
        const date = this.parseDateTime({
          date: fileModifyDate,
        })

        if (date && date.isValid) {
          return {
            source: EXIF_TAGS.FILE_MODIFICATION_DATE,
            raw: fileModifyDate,
            iso: date.toISO()!,
          }
        }
      }
    }

    return null
  }

  /**
   * Returns the UUID of the live photo source from the exif metadata of the photo provided
   */
  extractLivePhotoSourceUuidFromExif({
    metadata,
  }: {
    metadata: ExiftoolMetadata
  }): string | null {
    return (
      metadata[EXIF_TAGS.LIVE_PHOTO_UUID_PHOTO] ??
      metadata[EXIF_TAGS.LIVE_PHOTO_UUID_PHOTO_MEDIA_GROUP] ??
      null
    )
  }

  /**
   * Returns the UUID of the live photo target from the exif metadata of the video provided
   */
  extractLivePhotoTargetUuidFromExif({
    metadata,
  }: {
    metadata: ExiftoolMetadata
  }): string | null {
    return metadata[EXIF_TAGS.LIVE_PHOTO_UUID_VIDEO] ?? null
  }

  async extractGpsExifMetadata(path: string): Promise<{
    latitude: number
    longitude: number
  } | null> {
    const rawResult = await this.exiftool({
      args: ['-GPSLatitude', '-GPSLongitude', '-json', '-n'],
      path,
      options: {
        override: false,
        ignoreMinorErrors: false,
        dryRun: false,
      },
    })

    const result = JSON.parse(rawResult)[0]
    const gpsLatitude: number | null = result.GPSLatitude
    const gpsLongitude: number | null = result.GPSLongitude

    if (gpsLatitude === null || gpsLongitude === null) {
      return null
    }

    return {
      latitude: gpsLatitude,
      longitude: gpsLongitude,
    }
  }

  async setQuickTimeCreationDate(
    path: string,
    time: string,
    options: {
      override: boolean
      ignoreMinorErrors: boolean
      dryRun: boolean
    }
  ): Promise<void> {
    // QuickTime CreationDate is set on Apple videos. As it contains the TZ it is the most complete field possible.
    if (!EXIF_DATE_TIME_WITH_TZ_REGEX.test(time)) {
      throw new Error(
        `Invalid time provided ${time}. Please use ${EXIF_DATE_TIME_WITH_TZ_REGEX}`
      )
    }

    await this.exiftool({
      args: ['-api', 'QuickTimeUTC', '-P', `-quicktime:CreationDate=${time}`],
      path,
      options,
    })
  }

  /**
   * Sets all the times to the provided time.
   * Can also change the file attributes to be in sync.
   */
  async setAllTime(
    path: string,
    time: string,
    options: {
      file: boolean
      override: boolean
      ignoreMinorErrors: boolean
      dryRun: boolean
    }
  ): Promise<void> {
    if (
      !EXIF_DATE_TIME_WITH_TZ_REGEX.test(time) &&
      !EXIF_DATE_TIME_SUBSEC2_WITH_TZ_REGEX.test(time) &&
      !EXIF_DATE_TIME_SUBSEC3_WITH_TZ_REGEX.test(time)
    ) {
      throw new Error(
        `Invalid time provided ${time}. Please use ${EXIF_DATE_TIME_WITH_TZ_REGEX}, ${EXIF_DATE_TIME_SUBSEC2_WITH_TZ_REGEX} or ${EXIF_DATE_TIME_SUBSEC3_WITH_TZ_REGEX}`
      )
    }

    await this.exiftool({
      args: [
        '-api',
        'QuickTimeUTC',
        '-wm',
        'w',
        `-time:all=${time}`,
        ...(options.file
          ? [`-FileCreateDate=${time}`, `-FileModifyDate=${time}`]
          : ['-P']),
      ],
      path,
      options,
    })
  }

  /**
   * Sets the time zone offset in the exif data (for photos)
   */
  async setTimezoneOffsets(
    path: string,
    offset: string,
    options: {
      override: boolean
      ignoreMinorErrors: boolean
      dryRun: boolean
    }
  ): Promise<void> {
    if (!TZ_OFFSET_REGEX.test(offset)) {
      throw new Error(
        `Invalid offset provided ${offset}. Please use ${EXIF_DATE_TIME_WITH_TZ_REGEX}`
      )
    }

    await this.exiftool({
      args: [
        '-P',
        `-OffsetTime=${offset}`,
        `-OffsetTimeOriginal=${offset}`,
        `-OffsetTimeDigitized=${offset}`,
      ],
      path,
      options,
    })
  }

  async setOrientation(
    path: string,
    orientation: number,
    options: {
      override: boolean
      ignoreMinorErrors: boolean
      dryRun: boolean
    }
  ): Promise<void> {
    if (orientation < 1 || orientation > 8) {
      throw new Error(
        `Invalid orientation provided ${orientation}. Please use a number between 1 and 8`
      )
    }

    await this.exiftool({
      args: ['-P', `-orientation#=${orientation}`],
      path,
      options,
    })
  }

  async setRotation(
    path: string,
    rotation: number,
    options: {
      override: boolean
      ignoreMinorErrors: boolean
      dryRun: boolean
    }
  ): Promise<void> {
    if (rotation < 0 || rotation > 360) {
      throw new Error(
        `Invalid rotation provided ${rotation}. Please use a number between 0 and 360`
      )
    }

    await this.exiftool({
      args: ['-P', `-rotation=${rotation}`],
      path,
      options,
    })
  }

  async setGpsCoordinates(
    path: string,
    latitude: number,
    longitude: number,
    options: {
      override: boolean
      ignoreMinorErrors: boolean
      dryRun: boolean
    }
  ): Promise<void> {
    await this.exiftool({
      args: ['-P', `-gpsposition=${latitude},${longitude}`],
      path,
      options,
    })
  }

  async exiftool({
    args,
    path,
    options,
  }: {
    args: string[]
    path: string
    options: {
      override: boolean
      ignoreMinorErrors: boolean
      dryRun: boolean
    }
  }): Promise<string> {
    await ensureFile(path)

    return await this.rawExiftool({
      args: [
        ...(options.override ? ['-overwrite_original'] : []),
        ...(options.ignoreMinorErrors ? ['-m'] : []),
        ...args,
        path,
      ],
      dryRun: options.dryRun,
    })
  }

  private async rawExiftool({
    args,
    dryRun,
  }: {
    args: string[]
    dryRun: boolean
  }): Promise<string> {
    this.config.logger?.command(
      ['exiftool', ...args].map(quoteForDisplay).join(' '),
      dryRun
    )

    if (dryRun) {
      return ''
    }

    const {stdout} = await execFile('exiftool', args)
    return stdout
  }

  private parseDateTime({
    date,
    fallbackTimeZone,
  }: {
    date: string
    fallbackTimeZone?: string
  }): DateTime | null {
    if (EXIF_DATE_TIME_SUBSEC3_WITH_TZ_REGEX.test(date)) {
      return DateTime.fromFormat(date, EXIF_DATE_TIME_SUBSEC3_FORMAT_WITH_TZ, {
        setZone: true,
      })
    }
    if (EXIF_DATE_TIME_SUBSEC2_WITH_TZ_REGEX.test(date)) {
      return DateTime.fromFormat(date, EXIF_DATE_TIME_SUBSEC2_FORMAT_WITH_TZ, {
        setZone: true,
      })
    }
    if (EXIF_DATE_TIME_SUBSEC_REGEX.test(date)) {
      return DateTime.fromFormat(date, EXIF_DATE_TIME_SUBSEC_FORMAT, {
        zone: fallbackTimeZone,
      })
    }
    if (EXIF_DATE_TIME_WITH_TZ_REGEX.test(date)) {
      return DateTime.fromFormat(date, EXIF_DATE_TIME_FORMAT_WITH_TZ, {
        setZone: true,
      })
    }
    if (EXIF_DATE_TIME_WITH_UTC_REGEX.test(date)) {
      // Remove Z at the end of the string
      return DateTime.fromFormat(date.slice(0, -1), EXIF_DATE_TIME_FORMAT, {
        zone: 'utc',
      })
    }
    if (EXIF_DATE_TIME_REGEX.test(date)) {
      return DateTime.fromFormat(date, EXIF_DATE_TIME_FORMAT, {
        zone: fallbackTimeZone,
      })
    }
    return null
  }
}
