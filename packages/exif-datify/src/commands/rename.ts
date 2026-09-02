import {Args, Command, Flags} from '@oclif/core'
import {DatifyService} from '../lib/DatifyService.js'
import {
  defaultProgressLogger,
  videosLastComparator,
  walkFiles,
} from '@hwaterke/file-utils'

export default class ExifDatify extends Command {
  static description =
    'rename files with date and time information from Exif data'

  static flags = {
    dryRun: Flags.boolean({
      char: 'd',
      description: 'show how files would be renamed without doing it',
    }),
    prefix: Flags.string({
      char: 'p',
      description: 'Format used for the prefix, see luxon documentation',
      default: 'yyyy-MM-dd_HH-mm-ss_',
    }),
    extensions: Flags.string({
      char: 'e',
      description:
        'which file extensions to process (comma separated) e.g. (mov,mp4,jpg)',
    }),
    zone: Flags.string({
      char: 'z',
      description:
        'which IANA time zone to use for the date and time information found in UTC (default is local time) e.g. Europe/Brussels',
    }),
    skipBasename: Flags.boolean({
      char: 'b',
      description: 'skip the basename of the file',
    }),
    time: Flags.boolean({
      char: 't',
      description:
        'fallback to the time of the file when no date and time is found',
      default: false,
    }),
    srt: Flags.boolean({
      description:
        'rename .srt files with the same date as the video they share their name with.',
      default: false,
    }),
    livePhotoInfix: Flags.string({
      description:
        'adds an infix to the videos of a live photo (after the date prefix and before the original filename)',
    }),
    recursive: Flags.boolean({
      char: 'r',
      description: 'process directories recursively',
      default: false,
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
    } = await this.parse(ExifDatify)

    const service = new DatifyService({
      dryRun: flags.dryRun,
      prefix: flags.prefix,
      skipBasename: flags.skipBasename,
      timeZone: flags.zone,
      fileTimeFallback: flags.time,
      srt: flags.srt,
      livePhotoInfix:
        flags.livePhotoInfix !== undefined && flags.livePhotoInfix !== ''
          ? flags.livePhotoInfix
          : null,
    })

    await walkFiles({
      path,
      callback: (entry) => service.processFile(entry),
      onFile: defaultProgressLogger((message) => this.log(message)),
      sort: videosLastComparator,
      filter: flags.recursive ? undefined : (_, d) => !d.isDirectory(),
    })
  }
}
