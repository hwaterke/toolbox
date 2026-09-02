import {EXIF_TAGS, ExiftoolService} from '@hwaterke/media-probe'
import {Args, Command, Flags} from '@oclif/core'
import nodePath from 'node:path'
import {Logger} from '../lib/Logger.js'
import fs from 'node:fs'
import {
  compareAsc,
  defaultProgressLogger,
  walkFiles,
} from '@hwaterke/file-utils'

function subtractOneHour(offset: string): string {
  const match = offset.match(/^([+-])(\d{2}):(\d{2})$/)
  if (!match) {
    throw new Error('Invalid time offset format')
  }

  let [, sign, hoursStr, minutesStr] = match
  let hours = parseInt(hoursStr, 10)
  let minutes = parseInt(minutesStr, 10)

  // Convert total offset to minutes
  let totalMinutes = hours * 60 + minutes
  if (sign === '-') totalMinutes = -totalMinutes

  // Subtract one hour
  totalMinutes -= 60

  // Compute new sign
  const newSign = totalMinutes >= 0 ? '+' : '-'
  totalMinutes = Math.abs(totalMinutes)

  const newHours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, '0')
  const newMinutes = (totalMinutes % 60).toString().padStart(2, '0')

  return `${newSign}${newHours}:${newMinutes}`
}

export default class NikonFixCommand extends Command {
  static description =
    'Temp command to find and fix Nikon files that were wrongly fixed'

  static flags = {
    dryRun: Flags.boolean({
      char: 'd',
      description: 'dry run',
    }),
    deleteLowResolution: Flags.boolean({
      char: 'l',
      description: 'delete low resolution files',
    }),
  }

  static args = {
    path: Args.string({
      name: 'path',
      description: 'path to file or directory to process',
      required: true,
    }),
  }

  async run() {
    const {
      args: {path},
      flags,
    } = await this.parse(NikonFixCommand)

    const exifService = new ExiftoolService({logger: Logger})

    await walkFiles({
      path,
      callback: async (entry) => {
        // Skip if not JPG or NEF
        const ext = nodePath.extname(entry).toUpperCase()

        if (!['.JPG', '.NEF'].includes(ext)) {
          Logger.debug(`Skipping file with ext ${ext}`)
          return
        }

        // Get metadata
        const metadata = await exifService.extractExifMetadata(entry)

        const make = metadata['EXIF:IFD0:Make']
        // Stop if the file is not a Nikon file
        if (!make || make !== 'NIKON CORPORATION') {
          Logger.debug(`Skipping file - Not a Nikon file`)
          return
        }

        const model = metadata[EXIF_TAGS.EXIF_MODEL]
        const megapixels = metadata[EXIF_TAGS.COMPOSITE_MEGAPIXELS]
        if (model === 'NIKON D3500' && megapixels && megapixels < 10) {
          Logger.warn(`${entry} Low resolution file: ${megapixels}MP`)
          if (!flags.dryRun && flags.deleteLowResolution) {
            Logger.info(`Deleting ${entry}`)
            await fs.promises.unlink(entry)
          }
          return
        }

        // Check Maker Offset and Offset
        const offset = metadata['EXIF:ExifIFD:OffsetTimeOriginal']
        const nikonTimeZone = metadata['MakerNotes:Nikon:TimeZone']
        const daylightSavings = metadata['MakerNotes:Nikon:DaylightSavings']

        if (!offset) {
          Logger.info(`${entry} No offset`)
          // Just need to process the file
          return
        }

        if (daylightSavings === 'Yes') {
          if (offset === nikonTimeZone) {
            const newOffset = subtractOneHour(offset as string)
            Logger.info(
              `${entry} Incorrect daylight saving offset: Offset:${offset} Nikon:${nikonTimeZone}. Should be ${newOffset}`
            )

            // Set the new offset
            await exifService.exiftool({
              args: ['-P', `-Nikon:TimeZone="${newOffset}"`],
              path: entry,
              options: {
                override: true,
                ignoreMinorErrors: true,
                dryRun: flags.dryRun,
              },
            })

            return
          }
        }
      },
      onFile: defaultProgressLogger((message) => Logger.debug(message)),
      sort: compareAsc,
    })
  }
}
