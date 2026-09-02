import {Command, Flags} from '@oclif/core'
import {IndexerService} from '../services/IndexerService.ts'
import {humanReadableSeconds} from '../utils.ts'
import {LoggerService} from '../services/LoggerService.ts'

export default class Info extends Command {
  static description = 'prints information about the database'

  static flags = {
    database: Flags.string({
      char: 'd',
      description: 'database file',
      default: 'fs-index.db',
    }),
    duplicates: Flags.boolean({default: false}),
    debug: Flags.boolean({
      description: 'enable debug logging',
    }),
    logFolder: Flags.string({
      description: 'folder to save logs',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Info)

    LoggerService.configure({
      logFolder: flags.logFolder,
      debug: flags.debug,
    })

    const indexer = new IndexerService(flags.database)
    await indexer.init()

    await indexer.info()

    LoggerService.getLogger().info(
      `Operation performed in ${humanReadableSeconds(indexer.elapsedSeconds())}`
    )
  }
}
