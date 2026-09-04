import {EXIF_TAGS, ExiftoolService} from '@hwaterke/media-probe'
import {Args, Command, Flags} from '@oclif/core'
import {promises as FS} from 'node:fs'
import {Logger} from '../lib/Logger.ts'
import {
  compareAsc,
  defaultProgressLogger,
  walkFiles,
} from '@hwaterke/file-utils'

const megapixelsFlag = Flags.custom<number>({
  parse: async (input) => {
    const value = Number(input)
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Expected a positive number of megapixels, got ${input}`)
    }
    return value
  },
})

/**
 * Finds the shrunken copies SnapBridge leaves behind.
 *
 * The phone app syncs a downscaled version of each shot, and those copies land
 * in the backups next to the real files: same camera model, a fraction of the
 * pixels. Reporting is the default and deleting is opt-in, because the only
 * thing separating a phone copy from a real photo is its size.
 */
export default class FindLowResolutionCommand extends Command {
  static description =
    'find (and optionally delete) low resolution copies of photos'

  static flags = {
    model: Flags.string({
      char: 'm',
      description: 'only consider files shot with this camera model',
      default: 'NIKON D3500',
    }),
    maxMegapixels: megapixelsFlag({
      aliases: ['max-megapixels'],
      description: 'report files below this many megapixels',
      default: 10,
    }),
    delete: Flags.boolean({
      description: 'delete the files found instead of only reporting them',
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
    } = await this.parse(FindLowResolutionCommand)

    const exifService = new ExiftoolService({logger: Logger})
    const found: {path: string; megapixels: number}[] = []
    const failed: {path: string; reason: string}[] = []
    let deleted = 0

    await walkFiles({
      path,
      callback: async (entry) => {
        try {
          const metadata = await exifService.extractExifMetadata(entry)
          const megapixels = metadata[EXIF_TAGS.COMPOSITE_MEGAPIXELS]

          if (
            metadata[EXIF_TAGS.EXIF_MODEL] !== flags.model ||
            megapixels === undefined ||
            megapixels >= flags.maxMegapixels
          ) {
            return
          }

          found.push({path: entry, megapixels})

          if (flags.delete) {
            await FS.unlink(entry)
            deleted++
          }
        } catch (error) {
          failed.push({
            path: entry,
            reason: error instanceof Error ? error.message : String(error),
          })
        }
      },
      onFile: defaultProgressLogger((message) => Logger.debug(message)),
      sort: compareAsc,
    })

    Logger.info('')
    Logger.info('Summary')
    Logger.info(`  found     ${found.length}`)
    Logger.info(`  deleted   ${deleted}`)
    if (failed.length > 0) {
      Logger.info(`  failed    ${failed.length}`)
    }

    if (found.length > 0) {
      Logger.info('')
      Logger.warn(
        `${flags.model} under ${flags.maxMegapixels}MP (${found.length}):`
      )
      for (const entry of found) {
        Logger.warn(`  ${entry.path} - ${entry.megapixels}MP`)
      }
      if (!flags.delete) {
        Logger.info('')
        Logger.info('Nothing was deleted. Re-run with --delete to remove them.')
      }
    }

    if (failed.length > 0) {
      Logger.info('')
      Logger.error(`failed (${failed.length}):`)
      for (const entry of failed) {
        Logger.error(`  ${entry.path} - ${entry.reason}`)
      }
      this.exit(1)
    }
  }
}
