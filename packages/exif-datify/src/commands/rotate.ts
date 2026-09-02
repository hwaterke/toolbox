import {EXIF_TAGS, ExiftoolService} from '@hwaterke/media-probe'
import {Args, Command, Flags} from '@oclif/core'
import {Logger} from '../lib/Logger.js'
import {ensureFile} from '../lib/utils.js'

/**
 * Maps an EXIF orientation (1-8) to the value it becomes after rotating the
 * displayed image clockwise by `shift` quarter-turns (0-3).
 *
 * The two cycles list the orientations in clockwise order: the first for
 * upright images, the second for their mirrored counterparts. Together they
 * cover all eight EXIF orientations, including the mirrored ones (2, 4, 5, 7).
 */
function getOrientation(currentOrientation: number, shift: number): number {
  const cycles = [
    [1, 6, 3, 8],
    [2, 7, 4, 5],
  ]
  const cycle = cycles.find((c) => c.includes(currentOrientation))

  if (!cycle) {
    throw new Error(`Unsupported EXIF orientation: ${currentOrientation}`)
  }

  return cycle[(cycle.indexOf(currentOrientation) + shift) % 4]
}

/**
 * Maps a QuickTime/HEIF `irot` angle (0-3, where each unit is one 90°
 * counter-clockwise step) to the value it becomes after rotating the displayed
 * image clockwise by `shift` quarter-turns (0-3).
 */
function getRotation(currentRotation: number, shift: number): number {
  if (![0, 1, 2, 3].includes(currentRotation)) {
    throw new Error(`Unsupported rotation angle: ${currentRotation}`)
  }

  // A clockwise turn decreases the counter-clockwise `irot` angle.
  return (((currentRotation - shift) % 4) + 4) % 4
}

/**
 * Converts a rotation in degrees (a multiple of 90) into a number of clockwise
 * quarter-turns (0-3).
 */
function degreesToShift(degrees: number): number {
  return (((degrees / 90) % 4) + 4) % 4
}

export default class RotateCommand extends Command {
  static description =
    'rotate an image or video losslessly by editing its orientation metadata'

  static flags = {
    dryRun: Flags.boolean({
      char: 'd',
      description: 'show what would be done without modifying the file',
    }),
  }

  static args = {
    path: Args.string({
      name: 'path',
      description: 'path to the file to process',
      required: true,
    }),
    degrees: Args.integer({
      name: 'degrees',
      description:
        'degrees to rotate clockwise, negative for counter-clockwise (must be a multiple of 90)',
      default: 90,
      min: -270,
      max: 270,
    }),
  }

  async run() {
    const {
      args: {path, degrees},
      flags: {dryRun},
    } = await this.parse(RotateCommand)

    await ensureFile(path)

    if (degrees % 90 !== 0) {
      this.error(`degrees must be a multiple of 90 (got ${degrees})`)
    }

    const shift = degreesToShift(degrees)

    if (shift === 0) {
      this.log('Nothing to rotate (0°)')
      return
    }

    const exifService = new ExiftoolService({logger: Logger})

    const rawResult = await exifService.exiftool({
      args: ['-G0:1', '-json', '-n', '-orientation', '-rotation'],
      path,
      options: {
        override: false,
        ignoreMinorErrors: false,
        dryRun: false,
      },
    })
    const metadata = JSON.parse(rawResult)[0] ?? {}

    const orientation = metadata[EXIF_TAGS.ORIENTATION]
    const quickTimeRotation = metadata[EXIF_TAGS.QUICKTIME_ROTATION]
    const compositeRotation = metadata[EXIF_TAGS.COMPOSITE_ROTATION]

    const updatedTags = []

    if (orientation != null) {
      updatedTags.push(`-orientation=${getOrientation(orientation, shift)}`)
    }

    // On HEIC/HEIF, `QuickTime:Rotation` is the `irot` angle (0-3). With `-n`,
    // `-rotation=<angle>` updates the primary image's `irot`, which is what
    // Apple actually honors. The `-n` is required: without it `-rotation=` is a
    // silent no-op on HEIC.
    if (quickTimeRotation != null) {
      updatedTags.push(`-rotation=${getRotation(quickTimeRotation, shift)}`)
    } else if (compositeRotation != null) {
      // On videos, rotation lives in the track matrix and is expressed in
      // clockwise degrees.
      const newRotation = (((compositeRotation + degrees) % 360) + 360) % 360
      updatedTags.push(`-rotation=${newRotation}`)
    }

    if (updatedTags.length === 0) {
      this.log(
        `No orientation or rotation metadata found, nothing to do: ${path}`
      )
      return
    }

    this.log(`Rotating ${path}`)
    await exifService.exiftool({
      args: ['-P', '-n', ...updatedTags],
      path,
      options: {
        override: true,
        ignoreMinorErrors: true,
        dryRun,
      },
    })
  }
}
