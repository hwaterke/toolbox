import type {ExiftoolService} from '@hwaterke/media-probe'
import type {Plan} from './plan.ts'

/**
 * The doing half of a command. Every write a plan asked for goes out in one
 * exiftool call, so a crash cannot leave a file half-written.
 */
export async function applyPlan({
  path,
  plan,
  exifService,
  dryRun,
}: {
  path: string
  plan: Plan
  exifService: ExiftoolService
  dryRun: boolean
}): Promise<void> {
  if (plan.writes.length === 0) {
    return
  }

  await exifService.exiftool({
    args: ['-P', ...plan.writes],
    path,
    options: {
      override: true,
      ignoreMinorErrors: true,
      dryRun,
    },
  })
}
