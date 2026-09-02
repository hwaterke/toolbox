import {
  EXIF_DATE_TIME_FORMAT_WITH_TZ,
  EXIF_DATE_TIME_SUBSEC2_FORMAT_WITH_TZ,
  EXIF_OFFSET_FORMAT,
  EXIF_TAGS,
  type ExiftoolMetadata,
  ExiftoolService,
} from '@hwaterke/media-probe'
import {DateTime} from 'luxon'
import nodePath from 'node:path'
import {Logger} from './Logger.js'

/*
Example Nikon metadata (straight out of the camera):

exiftool -Time:All -G0:1 -json DSC_0352.JPG
[{
  "SourceFile": "DSC_0352.JPG",
  "File:System:FileModifyDate": "2025:05:09 09:18:14+02:00",
  "File:System:FileAccessDate": "2025:05:09 09:18:14+02:00",
  "File:System:FileInodeChangeDate": "2025:05:09 09:18:14+02:00",
  "EXIF:IFD0:ModifyDate": "2025:05:09 09:18:14",
  "EXIF:ExifIFD:DateTimeOriginal": "2025:05:09 09:18:14",
  "EXIF:ExifIFD:CreateDate": "2025:05:09 09:18:14",
  "MakerNotes:Nikon:TimeZone": "+01:00",
  "MakerNotes:Nikon:DaylightSavings": "Yes",
  "MakerNotes:Nikon:DateDisplayFormat": "Y/M/D",
  "MakerNotes:Nikon:PowerUpTime": "0000:00:00 00:00:00",
  "EXIF:ExifIFD:SubSecTime": 54,
  "EXIF:ExifIFD:SubSecTimeOriginal": 54,
  "EXIF:ExifIFD:SubSecTimeDigitized": 54,
  "XMP:XMP-xmp:CreateDate": "2025:05:09 09:18:14.54",
  "Composite:SubSecCreateDate": "2025:05:09 09:18:14.54",
  "Composite:SubSecDateTimeOriginal": "2025:05:09 09:18:14.54",
  "Composite:SubSecModifyDate": "2025:05:09 09:18:14.54"
}]

exiftool -Time:All -G0:1 -json DSC_0352.NEF
[{
  "SourceFile": "DSC_0352.NEF",
  "File:System:FileModifyDate": "2025:05:09 09:18:14+02:00",
  "File:System:FileAccessDate": "2025:05:09 09:18:14+02:00",
  "File:System:FileInodeChangeDate": "2025:05:09 09:18:14+02:00",
  "EXIF:IFD0:ModifyDate": "2025:05:09 09:18:14",
  "XMP:XMP-xmp:CreateDate": "2025:05:09 09:18:14.54",
  "EXIF:ExifIFD:DateTimeOriginal": "2025:05:09 09:18:14",
  "EXIF:ExifIFD:CreateDate": "2025:05:09 09:18:14",
  "MakerNotes:Nikon:TimeZone": "+01:00",
  "MakerNotes:Nikon:DaylightSavings": "Yes",
  "MakerNotes:Nikon:DateDisplayFormat": "Y/M/D",
  "MakerNotes:Nikon:PowerUpTime": "0000:00:00 00:00:00",
  "EXIF:ExifIFD:SubSecTime": 54,
  "EXIF:ExifIFD:SubSecTimeOriginal": 54,
  "EXIF:ExifIFD:SubSecTimeDigitized": 54,
  "EXIF:IFD0:DateTimeOriginal": "2025:05:09 09:18:14",
  "Composite:SubSecCreateDate": "2025:05:09 09:18:14.54",
  "Composite:SubSecDateTimeOriginal": "2025:05:09 09:18:14.54",
  "Composite:SubSecModifyDate": "2025:05:09 09:18:14.54"
}]
*/

export async function processNikon({
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

  if (!['.JPG', '.NEF'].includes(ext)) {
    logger.debug(`Skipping file with ext ${ext}`)
    return
  }

  const make = metadata[EXIF_TAGS.EXIF_MAKE]

  // Stop if the file is not a Nikon file
  if (!make || make !== 'NIKON CORPORATION') {
    logger.debug(`Skipping file - Not a Nikon file`)
    return
  }

  // Stop if the file was already fixed. OffsetTimeOriginal is not written by Nikon cameras, we write it when we fix the file
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
  if (isoDateTimeFromExif.source !== EXIF_TAGS.SUB_SEC_DATE_TIME_ORIGINAL) {
    throw new Error(
      `Unexpected source for the time ${isoDateTimeFromExif.source}`
    )
  }

  const dateTime = DateTime.fromISO(isoDateTimeFromExif.iso, {
    setZone: true,
  })

  logger.info(`Adding offset to ${path}`)
  const timeString =
    dateTime.millisecond === 0
      ? dateTime.toFormat(EXIF_DATE_TIME_FORMAT_WITH_TZ)
      : dateTime.toFormat(EXIF_DATE_TIME_SUBSEC2_FORMAT_WITH_TZ)

  const offsetString = dateTime.toFormat(EXIF_OFFSET_FORMAT)

  await exifService.setTimezoneOffsets(path, offsetString, {
    ignoreMinorErrors: true,
    override: true,
    dryRun,
  })

  if (ext === '.NEF') {
    // We do this to add the time offset to the XMP CreateDate tag
    await exifService.exiftool({
      args: ['-P', `-CreateDate="${timeString}"`],
      path,
      options: {
        override: true,
        ignoreMinorErrors: true,
        dryRun,
      },
    })
  }
}
