import {
  EXIF_DATE_TIME_FORMAT,
  EXIF_DATE_TIME_FORMAT_WITH_TZ,
  EXIF_OFFSET_FORMAT,
  EXIF_TAGS,
  type ExiftoolMetadata,
  ExiftoolService,
} from '@hwaterke/media-probe'
import {DateTime} from 'luxon'
import nodePath from 'node:path'
import {Logger} from './Logger.js'
import {updateTime} from './utils.js'

async function processVideo({
  path,
  ext,
  logger,
  metadata,
  zone,
  dryRun,
  exifService,
}: {
  path: string
  ext: string
  logger: typeof Logger
  metadata: ExiftoolMetadata
  zone: string
  dryRun: boolean
  exifService: ExiftoolService
}) {
  const goProModel = metadata[EXIF_TAGS.GOPRO_MODEL]

  // Stop if the file is not a GoPro file
  if (!goProModel) {
    logger.info(`Skipping file - Not a GoPro file`)
    return
  }

  // Stop if the file was already fixed. CreationDate is not written by GoPro cameras, we write it when we fix the file
  const quicktimeCreationDate = metadata[EXIF_TAGS.QUICKTIME_CREATION_DATE]
  if (quicktimeCreationDate) {
    logger.info(`Skipping file - Already fixed`)
    return
  }

  const quicktimeTime = metadata[EXIF_TAGS.QUICKTIME_CREATE_DATE]
  if (quicktimeTime === undefined) {
    throw new Error('No quicktime create date')
  }

  logger.info(`Current GoPro Create Date: ${quicktimeTime}`)

  const luxonQuickTimeTime = DateTime.fromFormat(
    quicktimeTime,
    EXIF_DATE_TIME_FORMAT,
    {zone}
  )

  const correctTimeString = luxonQuickTimeTime.toFormat(
    EXIF_DATE_TIME_FORMAT_WITH_TZ
  )

  logger.info(`Corrected GoPro Creation Date: ${correctTimeString}`)

  await updateTime({
    path,
    ext,
    time: luxonQuickTimeTime,
    exifService,
    dryRun,
  })
}

async function processImage({
  path,
  ext,
  logger,
  metadata,
  zone,
  dryRun,
  exifService,
}: {
  path: string
  ext: string
  logger: typeof Logger
  metadata: ExiftoolMetadata
  zone: string
  dryRun: boolean
  exifService: ExiftoolService
}) {
  const make = metadata[EXIF_TAGS.EXIF_MAKE]

  if (make !== 'GoPro') {
    logger.debug(`Skipping file - Not a GoPro photo`)
    return
  }

  // Stop if the file was already fixed. OffsetTimeOriginal is not written by GoPro cameras, we write it when we fix the file
  const offsetTime = metadata[EXIF_TAGS.EXIF_OFFSET_TIME_ORIGINAL]
  if (offsetTime) {
    logger.debug(`Skipping file - Already fixed`)
    return
  }

  const isoDateTimeFromExif = exifService.extractDateTimeFromExif({
    metadata,
    timeZone: zone,
    fileTimeFallback: false,
  })

  if (!isoDateTimeFromExif) {
    throw new Error('No date found in metadata')
  }
  if (isoDateTimeFromExif.source !== EXIF_TAGS.DATE_TIME_ORIGINAL) {
    throw new Error(
      `Unexpected source for the time ${isoDateTimeFromExif.source}`
    )
  }

  const dateTime = DateTime.fromISO(isoDateTimeFromExif.iso, {
    setZone: true,
  })

  const offsetString = dateTime.toFormat(EXIF_OFFSET_FORMAT)

  await exifService.setTimezoneOffsets(path, offsetString, {
    ignoreMinorErrors: true,
    override: true,
    dryRun,
  })
}

export async function processGopro({
  path,
  logger,
  metadata,
  zone,
  dryRun,
  exifService,
}: {
  path: string
  logger: typeof Logger
  metadata: ExiftoolMetadata
  zone: string
  dryRun: boolean
  exifService: ExiftoolService
}) {
  const ext = nodePath.extname(path).toUpperCase()

  if (['.MOV', '.MP4'].includes(ext)) {
    await processVideo({
      path,
      ext,
      logger,
      metadata,
      zone,
      dryRun,
      exifService,
    })
  }

  if (['.JPG'].includes(ext)) {
    await processImage({
      path,
      ext,
      logger,
      metadata,
      zone,
      dryRun,
      exifService,
    })
  }
}
