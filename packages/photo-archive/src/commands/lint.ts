import {Args, Command, Flags} from '@oclif/core'
import {DEFAULT_MAX_DAYS_EARLY} from '../lib/constants.ts'
import {lintArchive} from '../lib/lint.ts'
import {
  colorize,
  exitCode,
  formatLintReport,
  toJson,
} from '../lib/lintReport.ts'
import {PreflightError} from '../lib/preflight.ts'

export default class Lint extends Command {
  static description = 'check the photo archive against the archive rules'

  static args = {
    archiveRoot: Args.string({
      description: 'archive root, holding events/ and sorted/',
      required: true,
    }),
  }

  static flags = {
    only: Flags.string({
      description: 'judge only this path (repeatable)',
      multiple: true,
    }),
    rule: Flags.string({
      description: 'run only this rule id (repeatable)',
      multiple: true,
    }),
    verbose: Flags.boolean({
      description: 'list every finding instead of a sample per rule',
      default: false,
    }),
    strict: Flags.boolean({
      description: 'let warnings fail the run too',
      default: false,
    }),
    format: Flags.string({
      description: 'output format',
      options: ['text', 'json'],
      default: 'text',
    }),
    'max-days-early': Flags.integer({
      description: 'how many days before its event a file may be dated',
      default: DEFAULT_MAX_DAYS_EARLY,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Lint)
    const json = flags.format === 'json'

    try {
      const report = await lintArchive({
        archiveRoot: args.archiveRoot,
        only: flags.only,
        rules: flags.rule,
        strict: flags.strict,
        verbose: flags.verbose,
        maxDaysEarly: flags['max-days-early'],
        // Progress would corrupt the JSON on stdout.
        onProgress: json ? undefined : (message) => this.log(message),
      })

      if (json) {
        this.log(JSON.stringify(toJson(report), null, 2))
      } else {
        for (const line of formatLintReport(report)) {
          this.log(colorize(line))
        }
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
    }
  }
}
