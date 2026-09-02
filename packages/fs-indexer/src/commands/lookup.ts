import {Args, Command, Flags} from '@oclif/core'
import {IndexerService} from '../services/IndexerService.js'
import {humanReadableSeconds} from '../utils.js'
import {LoggerService} from '../services/LoggerService.js'

export default class Lookup extends Command {
  static description = 'searches for files within the database'

  static flags = {
    database: Flags.string({
      char: 'd',
      description: 'database file',
      default: 'fs-index.db',
    }),
    debug: Flags.boolean({
      description: 'enable debug logging',
    }),
    remove: Flags.boolean({
      description:
        'remove files if similar found in the index. Be careful with this flag. Only hashes are compared, not the files content.',
      default: false,
    }),
    removeSimilar: Flags.boolean({
      description: 'remove files if similar found in the index',
      default: false,
    }),
    exif: Flags.boolean({
      description: 'look for files with similar exif date',
      default: false,
    }),
    logFolder: Flags.string({
      description: 'folder to save logs',
    }),
    originalPaths: Flags.string({
      description:
        'comma-separated list of original paths to filter lookup results. Only files from these paths will be considered as potential matches.',
    }),
  }

  static args = {
    path: Args.string({required: true}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Lookup)

    LoggerService.configure({
      logFolder: flags.logFolder,
      debug: flags.debug,
    })

    const indexer = new IndexerService(flags.database)
    await indexer.init()

    // Parse original paths if provided
    const originalPaths = flags.originalPaths
      ? flags.originalPaths
          .split(',')
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      : undefined

    await indexer.lookup(args.path, {
      remove: flags.remove,
      removeSimilar: flags.removeSimilar,
      includeExif: flags.exif,
      originalPaths,
    })

    LoggerService.getLogger().info(
      `Operation performed in ${humanReadableSeconds(indexer.elapsedSeconds())}`
    )
  }
}
