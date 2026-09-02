import {Args, Command, Flags} from '@oclif/core'
import {ExiftoolService} from '@hwaterke/media-probe'
import {ensureFile, updateTime} from '../lib/utils.js'
import nodePath from 'node:path'
import {DateTime} from 'luxon'
import {Logger} from '../lib/Logger.js'

export default class SetDateCommand extends Command {
  static description = 'Sets exact date and time to the file provided'

  static flags = {
    time: Flags.string({
      char: 't',
      description: 'ISO 8601 date and time to set to the file',
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
    } = await this.parse(SetDateCommand)

    const exifService = new ExiftoolService({logger: Logger})

    await ensureFile(path)
    const ext = nodePath.extname(path).toUpperCase()

    const datetime = DateTime.fromISO(flags.time, {setZone: true})

    if (!datetime.isValid) {
      this.error('Invalid date and time provided')
    }

    await updateTime({
      path,
      ext,
      exifService,
      time: datetime,
      dryRun: false,
    })
  }
}
