import {Args, Command, Flags} from '@oclif/core'
import {DatifyService} from '../lib/DatifyService.js'
import {
  compareAsc,
  defaultProgressLogger,
  walkFiles,
} from '@hwaterke/file-utils'

export default class StripCommand extends Command {
  static description = 'removes date and time from filenames'

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
    } = await this.parse(StripCommand)

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
      async callback(entry) {
        await service.removePrefixFromFile(entry)
      },
      onFile: defaultProgressLogger((message) => this.log(message)),
      sort: compareAsc,
      filter: flags.recursive ? undefined : (_, d) => !d.isDirectory(),
    })
  }
}
