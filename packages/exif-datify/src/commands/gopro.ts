import {ExiftoolService} from '@hwaterke/media-probe'
import {Args, Command, Flags} from '@oclif/core'
import {Logger} from '../lib/Logger.js'
import {processGopro} from '../lib/processGopro.js'
import {
  compareAsc,
  defaultProgressLogger,
  walkFiles,
} from '@hwaterke/file-utils'

export default class GoProCommand extends Command {
  static description = 'write proper time for GoPro files'

  static flags = {
    dryRun: Flags.boolean({
      char: 'd',
      description: 'dry run',
    }),
    zone: Flags.string({
      char: 'z',
      description:
        'IANA time zone where the pictures/videos were taken e.g. Europe/Brussels',
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
    } = await this.parse(GoProCommand)

    const exifService = new ExiftoolService({logger: Logger})

    await walkFiles({
      path,
      callback: async (entry) => {
        await processGopro({
          path: entry,
          logger: Logger,
          metadata: await exifService.extractExifMetadata(entry),
          zone: flags.zone,
          dryRun: flags.dryRun,
          exifService,
        })
      },
      onFile: defaultProgressLogger((message) => Logger.info(message)),
      sort: compareAsc,
    })
  }
}
