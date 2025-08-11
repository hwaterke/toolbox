import {Args, Command, Flags} from '@oclif/core'
import {IndexerService} from '../services/IndexerService.js'
import {humanReadableSeconds} from '../utils.js'
import {LoggerService} from '../services/LoggerService.js'

export default class Crawl extends Command {
  static description =
    'index the folder provided, adding new files to the database'

  static flags = {
    database: Flags.string({
      char: 'd',
      description: 'database file',
      default: 'fs-index.db',
    }),
    limit: Flags.integer({
      char: 'l',
      description: 'stop after indexing n files',
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
    progress: Flags.boolean({
      description: 'show progress',
      default: false,
    }),
  }

  static args = {
    path: Args.string({required: true}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Crawl)

    LoggerService.configure({
      logFolder: flags.logFolder,
      debug: flags.debug,
    })

    const indexer = new IndexerService(flags.database)
    await indexer.init()

    await indexer.syncFiles({
      path: args.path,
      limit: flags.limit,
      minutes: flags.minutes,
      ignoreFileName: flags.ignore,
      withProgress: flags.progress,
    })

    LoggerService.getLogger().info(
      `Operation performed in ${humanReadableSeconds(indexer.elapsedSeconds())}`
    )
  }
}
