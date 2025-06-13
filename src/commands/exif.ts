import {Command, Flags} from '@oclif/core'
import {IndexerService} from '../services/IndexerService.js'
import {humanReadableSeconds} from '../utils.js'
import {LoggerService} from '../services/LoggerService.js'

export default class Exif extends Command {
  static description = 'populate missing EXIF data for indexed files'

  static flags = {
    database: Flags.string({
      char: 'd',
      description: 'database file',
      default: 'fs-index.db',
    }),
    limit: Flags.integer({
      char: 'l',
      description: 'stop after processing n files',
    }),
    minutes: Flags.integer({
      char: 'm',
      description: 'stop after n minutes',
    }),
    debug: Flags.boolean({
      description: 'enable debug logging',
    }),
    logFolder: Flags.string({
      description: 'folder to save logs',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Exif)

    LoggerService.configure({
      logFolder: flags.logFolder,
      debug: flags.debug,
    })

    const indexer = new IndexerService(flags.database)
    await indexer.init()

    await indexer.extractMissingExif({
      limit: flags.limit,
      minutes: flags.minutes,
    })

    LoggerService.getLogger().info(
      `Operation performed in ${humanReadableSeconds(indexer.elapsedSeconds())}`
    )
  }
}
