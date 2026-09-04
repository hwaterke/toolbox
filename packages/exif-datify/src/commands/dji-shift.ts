import {Args, Command, Flags} from '@oclif/core'
import {EXIF_DATE_TIME_FORMAT_WITH_TZ, updateTime} from '../lib/utils.ts'
import {durationToSeconds} from '../lib/duration.ts'
import {DIFFERENCE_THRESHOLD_SECONDS, hourDifference} from '../lib/hourShift.ts'
import nodePath from 'node:path'
import fs from 'node:fs'
import {DateTime} from 'luxon'
import {EXIF_TAGS, ExiftoolService} from '@hwaterke/media-probe'
import {Logger} from '../lib/Logger.ts'
import {
  compareAsc,
  defaultProgressLogger,
  walkFiles,
} from '@hwaterke/file-utils'

/**
 * Fixes time of all files in a directory shifted by one or two hours.
 * It assumes the file time is correct and the quicktime (metadata) time is wrong.
 */
export default class DjiShiftCommand extends Command {
  static description =
    'shifts the time of all files in a directory by one/two hour'

  static flags = {
    dryRun: Flags.boolean({
      char: 'd',
      description: 'dry run',
    }),
    zone: Flags.string({
      char: 'z',
      description:
        'IANA time zone where the pictures videos were taken e.g. Europe/Brussels',
      required: true,
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
    } = await this.parse(DjiShiftCommand)

    const exifService = new ExiftoolService({logger: Logger})

    await walkFiles({
      path,
      filter: (_, d) => !d.isDirectory(),
      callback: async (entry) => {
        const ext = nodePath.extname(entry)
        const basename = nodePath.basename(entry, ext)
        const extUpper = ext.toUpperCase()

        if (extUpper === '.SRT') {
          this.log(`Skipping ${entry}.`)
          return
        }

        const metadata = await exifService.extractExifMetadata(entry)

        // Extract the file time
        const fileTime = metadata[EXIF_TAGS.FILE_MODIFICATION_DATE]
        if (fileTime === undefined) {
          throw new Error('No file modification date')
        }
        const luxonFileTime = DateTime.fromFormat(
          fileTime,
          EXIF_DATE_TIME_FORMAT_WITH_TZ,
          {zone: flags.zone}
        )

        // Extract the duration
        const duration = metadata[EXIF_TAGS.QUICKTIME_DURATION]
        const durationSeconds = duration ? durationToSeconds(duration) : 0

        // Extract the metadata time
        const isoDateTimeFromExif = exifService.extractDateTimeFromExif({
          metadata,
          timeZone: flags.zone,
          fileTimeFallback: false,
        })
        if (!isoDateTimeFromExif) {
          throw new Error('No date found in metadata')
        }
        const luxonMetadataTime = DateTime.fromISO(isoDateTimeFromExif.iso, {
          setZone: true,
        })

        // Extract the SRT time
        const srtFile = nodePath.join(
          nodePath.dirname(entry),
          `${basename}.SRT`
        )
        let srtLuxonTime: DateTime | undefined
        if (fs.existsSync(srtFile)) {
          const srtContent = fs.readFileSync(srtFile, 'utf8')
          // Format inside the SRT file is: 2025-06-28 20:06:08.108
          const srtTime = srtContent.match(
            /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})/
          )?.[1]
          if (srtTime) {
            srtLuxonTime = DateTime.fromFormat(
              srtTime,
              'yyyy-MM-dd HH:mm:ss.SSS',
              {
                setZone: true,
              }
            )
          }
        }

        // Debug
        this.log(`File time: ${luxonFileTime.toISO()}`)
        this.log(`Metadata time: ${luxonMetadataTime.toISO()}`)
        this.log(`SRT time: ${srtLuxonTime?.toISO()}`)
        this.log(`Duration: ${duration}`)
        this.log(`Duration seconds: ${durationSeconds}`)

        // Check the difference between file time and exif time
        const roundHourDifference = hourDifference({
          metadataTimeMs: luxonMetadataTime.toMillis(),
          fileTimeMs: luxonFileTime.toMillis(),
          durationSeconds,
        })

        // Compute the correct time
        const correctDateTime = luxonMetadataTime.minus({
          hours: roundHourDifference,
        })

        this.log(`Correct time: ${correctDateTime.toISO()}`)

        // Check if the SRT time is close to the correct time
        if (srtLuxonTime) {
          const srtDifferenceMs =
            srtLuxonTime.toMillis() - correctDateTime.toMillis()
          const srtDifferenceSeconds = srtDifferenceMs / 1000
          this.log(`SRT difference: ${srtDifferenceSeconds} seconds`)
          if (srtDifferenceSeconds > DIFFERENCE_THRESHOLD_SECONDS) {
            throw new Error(
              `SRT time is too far from the correct time: ${srtDifferenceSeconds} seconds. Please check the file time manually.`
            )
          }
        }

        if (roundHourDifference === 0) {
          this.log(`No issue found.`)

          if (
            ['.MOV', '.MP4'].includes(extUpper) &&
            metadata[EXIF_TAGS.QUICKTIME_CREATION_DATE]
          ) {
            this.log(
              `Skipping, creation date already set: ${metadata[EXIF_TAGS.QUICKTIME_CREATION_DATE]}.`
            )
            return
          }

          if (
            ['.JPG', '.DNG'].includes(extUpper) &&
            metadata[EXIF_TAGS.EXIF_OFFSET_TIME]
          ) {
            this.log(
              `Skipping, offset time already set: ${metadata[EXIF_TAGS.EXIF_OFFSET_TIME]}.`
            )
            return
          }
        }

        if (roundHourDifference > 0) {
          this.log(
            `Classic DJI issue. The metadata time is ${roundHourDifference} hours ahead of the file time.`
          )
        } else {
          this.log(
            `Classic DJI issue. The metadata time is ${roundHourDifference} hours behind of the file time.`
          )
        }

        await updateTime({
          path: entry,
          ext: extUpper,
          exifService,
          time: correctDateTime,
          dryRun: flags.dryRun,
        })
      },
      onFile: defaultProgressLogger((message) => this.log(message)),
      sort: compareAsc,
    })
  }
}
