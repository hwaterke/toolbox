import {Args, Command, Flags} from '@oclif/core'
import {EXIF_TAGS, ExiftoolService} from '@hwaterke/media-probe'
import {moveFileSafely} from '../lib/utils.js'
import {Logger} from '../lib/Logger.js'
import nodePath from 'node:path'
import chalk from 'chalk'
import {sanitizeFilename} from '../lib/sanitizeFilename.js'
import {defaultProgressLogger, walkFiles} from '@hwaterke/file-utils'

export default class GroupByModel extends Command {
  static description =
    'group files into folders based on their camera make and model from EXIF data'

  static flags = {
    dryRun: Flags.boolean({
      char: 'd',
      description: 'show how files would be moved without doing it',
    }),
    recursive: Flags.boolean({
      char: 'r',
      description: 'process directories recursively',
      default: false,
    }),
  }

  static args = {
    path: Args.string({
      name: 'path',
      description: 'path to file or directory to process',
      required: true,
    }),
    destination: Args.string({
      name: 'destination',
      description: 'destination folder where files will be grouped',
      required: true,
    }),
  }

  async run() {
    const {
      args: {path, destination},
      flags,
    } = await this.parse(GroupByModel)

    const exifService = new ExiftoolService({logger: Logger})
    let totalProcessed = 0

    await walkFiles({
      path,
      callback: async (file) => {
        try {
          // Extract make and model from metadata
          const metadata = await exifService.extractExifMetadata(file)

          // Try EXIF tags first (for photos)
          let make = metadata[EXIF_TAGS.EXIF_MAKE]
          let model = metadata[EXIF_TAGS.EXIF_MODEL]

          // If not found, try QuickTime tags (for videos)
          if (!make || !model) {
            make = metadata[EXIF_TAGS.QUICKTIME_MAKE] ?? make
            model = metadata[EXIF_TAGS.QUICKTIME_KEYS_MODEL] ?? model
          }

          // Determine destination folder
          let groupFolder: string
          if (make && model) {
            const groupKey = sanitizeFilename(`${make}-${model}`)
            groupFolder = nodePath.join(destination, groupKey)
          } else {
            groupFolder = nodePath.join(destination, 'other')
          }

          // Move file to appropriate folder
          const fileName = nodePath.basename(file)
          const destinationPath = await moveFileSafely(
            file,
            groupFolder,
            flags.dryRun
          )
          this.log(`${fileName} -> ${destinationPath}`)
          totalProcessed++
        } catch (error) {
          this.log(chalk.red(`Error processing file ${file}: ${error}`))
        }
      },
      onFile: defaultProgressLogger((message) => this.log(message)),
      filter: flags.recursive ? undefined : (_, d) => !d.isDirectory(),
    })

    this.log(`\n${totalProcessed} files processed`)
  }
}
