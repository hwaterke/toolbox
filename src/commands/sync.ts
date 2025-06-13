import {Args, Command, Flags} from '@oclif/core'
import {IndexerService} from '../services/IndexerService.js'
import {humanReadableSeconds} from '../utils.js'
import {LoggerService} from '../services/LoggerService.js'

export default class Sync extends Command {
  static description =
    'sync the database with the file system, updating and removing files when needed'

  static flags = {
    database: Flags.string({
      char: 'd',
      description: 'database file',
      default: 'fs-index.db',
    }),
    applyChanges: Flags.boolean({
      description: 'apply changes to the file system',
    }),
    limit: Flags.integer({
      char: 'l',
      description: 'stop after scanning n files',
    }),
    minutes: Flags.integer({
      char: 'm',
      description: 'stop after n minutes',
    }),
    ignore: Flags.string({
      char: 'i',
      description: 'name of ignore file',
    }),
    debug: Flags.boolean({
      description: 'enable debug logging',
    }),
    logFolder: Flags.string({
      description: 'folder to save logs',
    }),
  }

  static args = {
    path: Args.string({required: true}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Sync)

    LoggerService.configure({
      logFolder: flags.logFolder,
      debug: flags.debug,
    })

    const indexer = new IndexerService(flags.database)
    await indexer.init()

    await indexer.syncIndexedFiles({
      path: args.path,
      limit: flags.limit,
      minutes: flags.minutes,
      ignoreFileName: flags.ignore,
      applyChanges: flags.applyChanges,
    })

    LoggerService.getLogger().info(
      `Operation performed in ${humanReadableSeconds(indexer.elapsedSeconds())}`
    )
  }
}
