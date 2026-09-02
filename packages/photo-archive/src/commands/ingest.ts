import {Args, Command, Flags} from '@oclif/core'
import nodePath from 'node:path'
import {ingest, PreflightError} from '../lib/ingest.ts'
import {Manifest, manifestPath} from '../lib/manifest.ts'
import {colorize, exitCode, formatReport} from '../lib/report.ts'

export default class Ingest extends Command {
  static description =
    'move already-renamed media from a folder into the photo archive'

  static args = {
    source: Args.string({
      description: 'folder holding the media to file',
      required: true,
    }),
    archiveRoot: Args.string({
      description: 'archive root, holding events/ and sorted/',
      required: true,
    }),
  }

  static flags = {
    event: Flags.string({
      description: 'file into events/<name>/footage instead of sorted/YYYY/MM',
    }),
    source: Flags.string({
      description: 'sub-folder inside footage, e.g. dji (requires --event)',
    }),
    'create-event': Flags.boolean({
      description: 'create the event folder when it does not exist',
      default: false,
    }),
    execute: Flags.boolean({
      description: 'actually move the files (default is a dry run)',
      default: false,
    }),
    'log-dir': Flags.string({
      description: 'where to write the manifest (default: current directory)',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Ingest)

    const logDir = flags['log-dir'] ?? process.cwd()
    const manifest = flags.execute
      ? new Manifest(manifestPath(nodePath.resolve(logDir), new Date()))
      : undefined

    try {
      const report = await ingest({
        source: args.source,
        archiveRoot: args.archiveRoot,
        event: flags.event,
        sourceName: flags.source,
        createEvent: flags['create-event'],
        execute: flags.execute,
        manifest,
        onProgress: (message) => this.log(message),
      })

      for (const line of formatReport(report)) {
        this.log(colorize(line))
      }

      const code = exitCode(report)
      if (code !== 0) {
        this.exit(code)
      }
    } catch (error) {
      if (error instanceof PreflightError) {
        this.error(error.message, {exit: 2})
      }
      throw error
    } finally {
      await manifest?.close()
    }
  }
}
