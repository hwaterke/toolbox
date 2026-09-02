import {Args, Command, Flags} from '@oclif/core'
import {colorize} from '../lib/report.ts'
import {formatUndoReport, undo, undoExitCode} from '../lib/undo.ts'

export default class Undo extends Command {
  static description = 'move files back where an ingest run took them from'

  static args = {
    manifest: Args.string({
      description: 'the .manifest.jsonl written by an ingest run',
      required: true,
    }),
  }

  static flags = {
    execute: Flags.boolean({
      description: 'actually move the files back (default is a dry run)',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Undo)

    const report = await undo({
      manifestPath: args.manifest,
      execute: flags.execute,
      onProgress: (message) => this.log(message),
    })

    for (const line of formatUndoReport(report)) {
      this.log(colorize(line))
    }

    const code = undoExitCode(report)
    if (code !== 0) {
      this.exit(code)
    }
  }
}
