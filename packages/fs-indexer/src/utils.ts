import {access, lstat} from 'node:fs/promises'
import {constants} from 'node:fs'
import * as nodePath from 'node:path'
import {homedir} from 'node:os'
import {HashingAlgorithmType} from './services/HashingService.js'
import {FfmpegService} from './services/FfmpegService.js'
import {EXIF_TAGS, ExiftoolService} from '@hwaterke/media-probe'
import {LoggerService} from './services/LoggerService.js'

export const uniq = <T>(array: T[]): T[] => [...new Set(array)]

export const getHashingAlgorithms = (
  input: string[] | undefined
): HashingAlgorithmType[] => {
  const result = uniq(input || [])
  return result as HashingAlgorithmType[]
}

export const humanReadableSeconds = (seconds: number): string => {
  if (seconds > 3600) {
    const hours = Math.floor(seconds / 3600)
    const secondsLeft = seconds % 3600
    return `${hours} hours ${Math.floor(secondsLeft / 60)} minutes ${
      secondsLeft % 60
    } seconds`
  }

  if (seconds >= 60) {
    return `${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds`
  }

  return `${seconds} seconds`
}

export const expandPath = (path: string): string => {
  if (path.startsWith('~/') || path === '~') {
    path = path.replace('~', homedir())
  }

  return nodePath.resolve(path)
}

/**
 * Returns true if the provided path is a directory
 */
export const isDirectory = async (path: string): Promise<boolean> => {
  const stat = await lstat(path)
  return stat.isDirectory()
}

/**
 * Makes sure the provided path is a valid file
 */
export const ensureFile = async (path: string): Promise<void> => {
  if (await isDirectory(path)) {
    throw new Error(`${path} is a directory and not a file`)
  }
  await access(path, constants.F_OK)
}

const EXIF_IMAGE_MAKE = 'EXIF:IFD0:Make'
const EXIF_VIDEO_MAKE = 'QuickTime:Keys:Make'

const EXIF_MODEL_KEYS = [
  'EXIF:IFD0:Model',
  'QuickTime:UserData:Model',
  'QuickTime:Keys:Model',
  'QuickTime:GoPro:Model',
]
const EXIF_WIDTH_KEYS = [
  'EXIF:ExifIFD:ExifImageWidth',
  'EXIF:SubIFD:ImageWidth',
  'QuickTime:Track1:ImageWidth',
  'PNG:ImageWidth',
  'File:ImageWidth',
]
const EXIF_HEIGHT_KEYS = [
  'EXIF:ExifIFD:ExifImageHeight',
  'QuickTime:Track1:ImageHeight',
  'EXIF:SubIFD:ImageHeight',
  'PNG:ImageHeight',
  'File:ImageHeight',
]

export type ExifMetadata = {
  make?: string
  model?: string
  width?: number
  height?: number
  exifDate?: string | null
  livePhotoSource?: string
  livePhotoTarget?: string
  latitude?: number
  longitude?: number
  exifValidatedAt: Date
}

const EXIF_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.dng',
  '.heic',
  '.mov',
  '.mp4',
  '.nef',
])

const toNumber = (input: string | number | undefined): number | undefined => {
  if (input === undefined) {
    return undefined
  }
  if (typeof input === 'string') {
    return Number(input)
  }
  return input
}

export const extractExif = async (path: string): Promise<ExifMetadata> => {
  // Skip unknown extensions
  if (!EXIF_EXTENSIONS.has(nodePath.extname(path).toLocaleLowerCase())) {
    return {
      exifValidatedAt: new Date(),
    }
  }

  const service = new ExiftoolService({
    logger: LoggerService.getLogger(),
  })

  LoggerService.getLogger().debug(`Extracting exif for ${path}`)
  const exif = await service.extractExifMetadata(path)

  const date = service.extractDateTimeFromExif({
    metadata: exif,
    fileTimeFallback: false,
  })

  // Extract Gps position
  let gps = await service.extractGpsExifMetadata(path)

  if (
    gps === null &&
    ['.mov', '.mp4'].includes(nodePath.extname(path).toLowerCase())
  ) {
    const ffmpegService = new FfmpegService()
    gps = await ffmpegService.extractGpsCoordinatesFromSubtitleFile(path)

    if (gps === null) {
      gps = await ffmpegService.extractGpsCoordinatesFromSubtitles(path)
    }
  }

  return {
    make:
      (exif[EXIF_IMAGE_MAKE] as string) ||
      (exif[EXIF_VIDEO_MAKE] as string) ||
      (exif[EXIF_TAGS.GOPRO_MODEL] && 'GoPro') ||
      ((exif['QuickTime:Track1:HandlerDescription'] as string) ===
      '\u0010DJI.AVC'
        ? 'DJI'
        : undefined),
    model: EXIF_MODEL_KEYS.map((k) => exif[k]).find(
      (key) => key !== undefined
    ) as string | undefined,
    width: toNumber(
      EXIF_WIDTH_KEYS.map((k) => exif[k]).find((key) => key !== undefined)
    ),
    height: toNumber(
      EXIF_HEIGHT_KEYS.map((k) => exif[k]).find((key) => key !== undefined)
    ),
    exifDate: date ? date.iso : null,
    livePhotoSource: exif[EXIF_TAGS.LIVE_PHOTO_UUID_PHOTO],
    livePhotoTarget: exif[EXIF_TAGS.LIVE_PHOTO_UUID_VIDEO],
    latitude: gps?.latitude,
    longitude: gps?.longitude,
    exifValidatedAt: new Date(),
  }
}
