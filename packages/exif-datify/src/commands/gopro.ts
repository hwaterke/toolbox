import {ExiftoolService} from '@hwaterke/media-probe'
import {Args, Command, Flags} from '@oclif/core'
import {Logger} from '../lib/Logger.ts'
import {applyPlan} from '../lib/applyPlan.ts'
import {planGopro} from '../lib/planGopro.ts'
import {PlanSummary} from '../lib/PlanSummary.ts'
import {
  compareAsc,
  defaultProgressLogger,
  walkFiles,
} from '@hwaterke/file-utils'

export default class GoProCommand extends Command {
  static description = 'write proper time for GoPro files'

  static flags = {
    dryRun: Flags.boolean({
      char: 'd',
      description: 'dry run',
    }),
    zone: Flags.string({
      char: 'z',
      description:
        'IANA time zone where the pictures/videos were taken e.g. Europe/Brussels. Required: a GoPro records no time zone of its own',
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
    } = await this.parse(GoProCommand)

    const exifService = new ExiftoolService({logger: Logger})
    const summary = new PlanSummary()

    try {
      await walkFiles({
        path,
        callback: async (entry) => {
          try {
            const plan = planGopro(
              await exifService.extractExifMetadata(entry),
              {path: entry, zone: flags.zone}
            )
            summary.record(entry, plan)

            if (plan.writes.length > 0) {
              Logger.info(`${entry} - ${plan.reason}`)
              await applyPlan({
                path: entry,
                plan,
                exifService,
                dryRun: flags.dryRun,
              })
            }
          } catch (error) {
            summary.recordError(entry, error)
          }
        },
        onFile: defaultProgressLogger((message) => Logger.debug(message)),
        sort: compareAsc,
      })
    } catch (error) {
      // walkFiles aggregates anything the callback threw. The callback already
      // records its own errors, so reaching here means the walk itself broke.
      // Print the summary rather than a stack trace, then still fail.
      summary.print(Logger)
      throw error
    }

    summary.print(Logger)

    if (summary.failureCount > 0) {
      this.exit(1)
    }
  }
}
