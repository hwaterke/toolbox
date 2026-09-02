import {Args, Command, Flags} from '@oclif/core'
import {IndexerService} from '../services/IndexerService.ts'
import {HashingAlgorithmType} from '../services/HashingService.ts'
import {LoggerService} from '../services/LoggerService.ts'

export default class Hash extends Command {
  static description = 'Compute missing hashes for indexed files'

  static examples = ['<%= config.bin %> hash']

  static flags = {
    database: Flags.string({
      char: 'd',
      description: 'database file',
      default: 'fs-index.db',
    }),
    limit: Flags.integer({
      char: 'l',
      description: 'Limit the number of files to process',
    }),
    minutes: Flags.integer({
      char: 'm',
      description: 'Stop after specified number of minutes',
    }),
    algorithms: Flags.string({
      char: 'a',
      description: 'Comma-separated list of hashing algorithms to use',
      default: Object.values(HashingAlgorithmType).join(','),
    }),
    debug: Flags.boolean({
      description: 'enable debug logging',
    }),
    progress: Flags.boolean({
      description: 'show progress',
      default: false,
    }),
  }

  static args = {
    path: Args.string({required: false}),
  }

  async run(): Promise<void> {
    const {flags, args} = await this.parse(Hash)

    LoggerService.configure({
      logFolder: flags.logFolder,
      debug: flags.debug,
    })

    const algorithms = flags.algorithms
      .split(',')
      .map((a) => a.trim().toUpperCase())
      .filter((a): a is HashingAlgorithmType =>
        Object.values(HashingAlgorithmType).includes(a as HashingAlgorithmType)
      )

    if (algorithms.length === 0) {
      this.error('No valid hashing algorithms specified')
      return
    }

    const indexer = new IndexerService(flags.database)
    await indexer.init()

    await indexer.computeMissingHashes({
      limit: flags.limit,
      minutes: flags.minutes,
      hashingAlgorithms: algorithms,
      path: args.path,
      withProgress: flags.progress,
    })
  }
}
