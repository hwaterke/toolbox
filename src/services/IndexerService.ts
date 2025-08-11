import {expandPath, extractExif} from '../utils.js'
import {access, stat, unlink} from 'node:fs/promises'
import {constants} from 'node:fs'
import {DatabaseService} from './DatabaseService.js'
import * as nodePath from 'node:path'
import {HashingAlgorithmType, HashingService} from './HashingService.js'
import {IndexedFile, IndexedFileWithHashes} from '../drizzle/schema.js'
import {IgnoreManager, walkDirOrFile} from '../walkDirOrFile.js'
import {formatBytes, formatNumber} from '../utils/Formatter.js'
import {LoggerService} from './LoggerService.js'
import ora from 'ora'

type VerifyOptions = {
  limit?: number
  minutes?: number
  hashingAlgorithms: HashingAlgorithmType[]
  purge: boolean
}

type LookupOptions = {
  remove: boolean
  removeSimilar: boolean
  includeExif: boolean
}

export class IndexerService {
  private readonly databaseService
  private readonly hashingService = new HashingService()
  private readonly logger = LoggerService.getLogger()

  private metrics = {
    filesCrawled: 0,
    newFilesIndexed: 0,
    filesHashed: 0,
    hashesComputed: 0,
    exifExtracted: 0,
    startTimeMillis: Date.now(),
  }

  constructor(databasePath: string) {
    this.databaseService = new DatabaseService(databasePath)
  }

  async init() {
    await this.databaseService.init()
  }

  async info(): Promise<void> {
    const fileCount = await this.databaseService.countFiles()
    this.logger.info(`${formatNumber(fileCount)} files indexed`)
    const hashCount = await this.databaseService.countHashes()
    this.logger.info(`${formatNumber(hashCount)} hashes`)
    const totalSize = await this.databaseService.totalSize()
    this.logger.info(
      `${formatBytes(totalSize)} - ${formatNumber(totalSize)} bytes`
    )

    for await (const algorithm of Object.values(HashingAlgorithmType)) {
      const algoHashCount = await this.databaseService.countHashes(algorithm)
      this.logger.info(
        `${algoHashCount} hashes (${algorithm}) - ${Math.round(
          (100 * algoHashCount) / fileCount
        )}%`
      )
    }
  }

  async lookup(path: string, options: LookupOptions): Promise<void> {
    path = expandPath(path)
    this.logger.debug(`Lookup ${path}`)

    await walkDirOrFile({
      path,
      options: {
        ignoreFileName: null,
      },
      callback: async (filePath) => {
        this.logger.info(`Looking up ${filePath}`)

        const {exactHashes, similarityHashes} =
          await this.lookupExistingEntries(filePath)

        let removed = false

        if (exactHashes.length > 0) {
          this.logger.debug(`Files with exact hashes`)
          if (exactHashes.some((f) => f.path === filePath)) {
            this.logger.info(`🆗 ${filePath}`)
          } else {
            this.logger.info(`✅ ${filePath}`)
            if (options.remove) {
              this.logger.info(
                `Deleting ${filePath} as copies were found in the index`
              )
              await unlink(filePath)
              removed = true
            }
          }

          for (const file of exactHashes) {
            this.logger.info(`  ${file.path}`)
          }
        } else {
          this.logger.debug(`❌ Exact - ${filePath}`)
        }

        if (!removed) {
          if (similarityHashes.length > 0) {
            this.logger.debug(`Files with similar hashes`)
            if (similarityHashes.some((f) => f.path === filePath)) {
              this.logger.info(`🆗 ${filePath}`)
            } else {
              this.logger.info(`↕️ ${filePath}`)
              if (options.removeSimilar) {
                this.logger.info(
                  `Deleting ${filePath} as similar files were found in the index`
                )
                await unlink(filePath)
                removed = true
              }
            }

            for (const file of similarityHashes) {
              this.logger.info(`  ${file.path}`)
            }
          } else {
            this.logger.debug(`❌ Similar - ${filePath}`)
          }
        }

        if (!removed) {
          // Find similar exif date
          // const metadata = await this.getFileMetadata({
          //   filePath,
          // })
          // if (metadata.exifDate) {
          //   const similarExifDate =
          //     await this.databaseService.findFilesByExifDate(metadata.exifDate)
          //   if (similarExifDate.length > 0) {
          //     this.logger.info(`Files with similar exif date`)
          //     for (const file of similarExifDate) {
          //       this.logger.debug(`  ${file.path}`)
          //     }
          //   }
          // }

          // Find similar prefix
          const prefixMatch = nodePath
            .basename(filePath)
            .match(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/)
          if (prefixMatch) {
            const similarPrefix = await this.databaseService.findFilesByPrefix(
              prefixMatch[0]
            )
            if (similarPrefix.length > 0) {
              this.logger.info(`Files with similar prefix`)
              for (const file of similarPrefix) {
                this.logger.debug(`  ${file.path}`)
              }
            }
          }
        }

        return {stop: false}
      },
    })
  }

  async verify(path: string, options: VerifyOptions): Promise<void> {
    path = expandPath(path)
    this.logger.debug(`Verifying ${path}`)

    const fileCount = await this.databaseService.countFilesInPath({path})
    this.logger.debug(`${fileCount} indexed files in ${path}`)

    const filesToProcess = options.limit
      ? Math.min(fileCount, options.limit)
      : fileCount

    while (this.metrics.filesCrawled < filesToProcess) {
      // Grab next batch of files
      const files = await this.databaseService.findByValidityInPath({
        path,
        count: Math.min(100, filesToProcess - this.metrics.filesCrawled),
      })

      this.logger.debug(`Verifying ${files.length} files`)

      for (const file of files) {
        await this.verifyFile(file, options)
        this.metrics.filesCrawled++
      }

      // Time limit reached?
      if (
        options.minutes !== undefined &&
        this.elapsedMinutes() > options.minutes
      ) {
        break
      }
    }
  }

  async verifyFile(
    file: IndexedFileWithHashes,
    options: VerifyOptions
  ): Promise<void> {
    this.logger.debug(`${this.metrics.filesCrawled} Verifying ${file.path}`)

    try {
      await access(file.path, constants.F_OK)
    } catch {
      this.logger.info(`File ${file.path} does not exist anymore`)

      if (options.purge) {
        await this.databaseService.deleteFile({
          indexedFileId: file.id,
        })
      }
      return
    }

    // File still exists, validate the stats
    const metadata = await this.getFileMetadata({
      filePath: file.path,
    })

    if (metadata.size === file.size) {
      if (
        metadata.path === file.path &&
        metadata.basename === file.basename &&
        metadata.extension === file.extension &&
        metadata.mtime.getTime() === file.mtime.getTime()
      ) {
        await this.databaseService.updateFileValidity({
          indexedFileId: file.id,
        })
      } else {
        this.logger.info(
          `Inconsistent metadata for ${file.path}. ${JSON.stringify(
            metadata
          )} vs ${JSON.stringify(file)}`
        )
      }

      for await (const hashingAlgorithm of options.hashingAlgorithms) {
        const existingHash = file.hashes.find(
          (hash) => hash.algorithm === hashingAlgorithm
        )

        if (existingHash) {
          const hashResult = await this.hashingService.hash(
            file.path,
            hashingAlgorithm
          )
          if (hashResult !== null && hashResult.hash === existingHash.value) {
            await this.databaseService.updateHashValidity(
              file.id,
              existingHash.algorithm
            )
          } else {
            this.logger.info(
              `Inconsistent hash ${hashingAlgorithm} for ${file.path}. ${hashResult?.hash} vs ${existingHash.value}`
            )
          }
        } else {
          this.logger.info(`Missing hash ${hashingAlgorithm} for ${file.path}`)
        }
      }
    } else {
      this.logger.info(
        `${file.path} has a different size. ${metadata.size} vs ${file.size}`
      )
    }
  }

  /**
   * Hashes a file using the provided hashing algorithms if it hasn't been hashed yet.
   */
  private async hashFile({
    indexedFile,
    hashingAlgorithm,
  }: {
    hashingAlgorithm: HashingAlgorithmType
    indexedFile: {
      id: string
      path: string
    }
  }): Promise<void> {
    this.logger.debug(
      `Computing ${hashingAlgorithm} hash for ${indexedFile.path}`
    )
    let hashesComputed = false

    const result = await this.hashingService.hash(
      indexedFile.path,
      hashingAlgorithm
    )

    // Hashing algorithm is not applicable to the file
    if (result === null) {
      this.logger.debug(
        `${hashingAlgorithm} not applicable for ${indexedFile.path}`
      )
      return
    }

    this.metrics.hashesComputed++
    hashesComputed = true

    this.logger.debug(
      `Storing ${hashingAlgorithm} hash for ${indexedFile.path}`
    )
    await this.databaseService.createHash({
      indexedFileId: indexedFile.id,
      algorithm: hashingAlgorithm,
      version: result.version,
      hash: result.hash,
    })

    if (hashesComputed) {
      this.metrics.filesHashed++
    }
  }

  private async lookupExistingEntries(path: string): Promise<{
    exactHashes: IndexedFile[]
    similarityHashes: IndexedFile[]
  }> {
    this.logger.debug(`Looking up for entries similar to ${path}`)
    const {size} = await this.getFileMetadata({
      filePath: path,
    })

    const algorithmIsExact: Record<HashingAlgorithmType, boolean> = {
      [HashingAlgorithmType.XXHASH]: true,
      [HashingAlgorithmType.BLAKE3]: true,
      [HashingAlgorithmType.IDENTIFY]: false,
      [HashingAlgorithmType.FFMPG_SHA256]: false,
    }

    // Hashes of the file being looked up
    const hashes: Map<
      HashingAlgorithmType,
      {
        hash: string
        version: string
      }
    > = new Map()
    const getHash = async (algorithm: HashingAlgorithmType) => {
      if (!hashes.has(algorithm)) {
        const result = await this.hashingService.hash(path, algorithm)
        if (result !== null) {
          hashes.set(algorithm, result)
        }
      }
      return hashes.get(algorithm)
    }

    const exactMatches: IndexedFile[] = []
    const similarMatches: IndexedFile[] = []

    const filesWithSameSize = await this.databaseService.findFilesBySize(size)
    this.logger.debug(
      `Found ${filesWithSameSize.length} files with the same size`
    )

    for (const algorithm of Object.values(HashingAlgorithmType)) {
      // If there are no files with the same size, we can skip the exact hashing
      if (filesWithSameSize.length === 0 && algorithmIsExact[algorithm]) {
        continue
      }

      const hashResult = await getHash(algorithm)
      if (hashResult) {
        const filesWithSameHash =
          await this.databaseService.findFilesByHashValue(
            algorithm,
            hashResult.hash
          )

        for (const file of filesWithSameHash) {
          const listToAdd = algorithmIsExact[algorithm]
            ? exactMatches
            : similarMatches

          if (!listToAdd.some((f) => f.path === file.path)) {
            listToAdd.push(file)
          }
        }
      }
    }

    return {exactHashes: exactMatches, similarityHashes: similarMatches}
  }

  private async getFileMetadata({filePath}: {filePath: string}) {
    const stats = await stat(filePath)

    // We remove the subsecond part of the time as we store them as integers
    stats.mtime.setMilliseconds(0)

    return {
      path: filePath,
      size: stats.size,
      mtime: stats.mtime,
      basename: nodePath.basename(filePath),
      extension: nodePath.extname(filePath),
      validatedAt: new Date(),
    }
  }

  elapsedSeconds(): number {
    const now = Date.now()
    return Math.round((now - this.metrics.startTimeMillis) / 1000)
  }

  elapsedMinutes(): number {
    return Math.floor(this.elapsedSeconds() / 60)
  }

  async syncFiles({
    path,
    limit,
    minutes,
    ignoreFileName,
  }: {
    path: string
    limit?: number
    minutes?: number
    ignoreFileName?: string
  }): Promise<void> {
    path = expandPath(path)
    this.logger.debug(`Indexing ${path}`)

    await walkDirOrFile({
      path,
      options: {
        ignoreFileName: ignoreFileName ?? null,
      },
      callback: async (filePath) => {
        try {
          this.metrics.filesCrawled++

          await this.syncFile({
            filePath,
          })

          const shouldStopForLimit =
            limit !== undefined &&
            Math.max(this.metrics.newFilesIndexed, this.metrics.filesHashed) >=
              limit

          const shouldStopForTime =
            minutes !== undefined && this.elapsedMinutes() > minutes

          return {
            stop: shouldStopForLimit || shouldStopForTime,
          }
        } catch (error) {
          this.logger.error(`Error processing ${filePath}`)
          this.logger.error(`${error}`)
          // Skip this file and continue
          return {stop: false}
        }
      },
    })
  }

  /**
   * Syncs a single file with the index. Only adds new files, does not update existing ones.
   */
  private async syncFile({filePath}: {filePath: string}): Promise<void> {
    this.logger.debug(`Processing file ${filePath}`)
    const metadata = await this.getFileMetadata({filePath})
    const result = await this.databaseService.createFileIfNotExists(metadata)

    if (result) {
      this.logger.debug(`New file indexed: ${filePath}`)
      this.metrics.newFilesIndexed++
    } else {
      this.logger.debug(`File already indexed: ${filePath}`)
    }
  }

  async syncIndexedFiles({
    path,
    limit,
    minutes,
    ignoreFileName,
    applyChanges,
  }: {
    path: string
    limit?: number
    minutes?: number
    ignoreFileName?: string
    applyChanges: boolean
  }): Promise<void> {
    path = expandPath(path)
    this.logger.debug(`Verifying ${path}`)

    const ignoreManager = new IgnoreManager(ignoreFileName ?? null)

    const fileCount = await this.databaseService.countFilesInPath({path})
    this.logger.debug(`${fileCount} indexed files in ${path}`)

    const filesToProcess = limit ? Math.min(fileCount, limit) : fileCount

    while (this.metrics.filesCrawled < filesToProcess) {
      // Grab next batch of files
      const files = await this.databaseService.findByValidityInPath({
        path,
        count: Math.min(100, filesToProcess - this.metrics.filesCrawled),
      })

      this.logger.debug(`Verifying ${files.length} files`)

      for (const file of files) {
        await this.syncIndexedFile({
          indexedFile: file,
          ignoreManager,
          applyChanges,
        })
        this.metrics.filesCrawled++
      }

      // Time limit reached?
      if (minutes !== undefined && this.elapsedMinutes() > minutes) {
        break
      }
    }
  }

  /**
   * Sync an index entry with the file system. Updates the index to reflect the current state of the file system.
   */
  private async syncIndexedFile({
    indexedFile,
    ignoreManager,
    applyChanges,
  }: {
    indexedFile: IndexedFile
    ignoreManager: IgnoreManager
    applyChanges: boolean
  }): Promise<void> {
    // Remove if ignored
    // Remove if does not exist
    // Extract file metadata
    // Detect changes
    // Delete exif and hashes if changed

    const markOffline = async (reason: string) => {
      if (applyChanges) {
        this.logger.debug(`Marking ${indexedFile.path} as offline. ${reason}`)
        await this.databaseService.deleteFile({
          indexedFileId: indexedFile.id,
        })
      } else {
        this.logger.info(`File ${indexedFile.path} is offline. ${reason}`)
      }
    }

    if (ignoreManager.shouldIgnore(indexedFile.path, false)) {
      await markOffline('File is covered by an exclusion pattern')
      return
    }

    let metadata
    try {
      metadata = await this.getFileMetadata({filePath: indexedFile.path})
    } catch {
      await markOffline('File does not exist')
      return
    }

    if (
      metadata.size !== indexedFile.size ||
      metadata.mtime.getTime() !== indexedFile.mtime.getTime()
    ) {
      if (applyChanges) {
        await this.databaseService.updateFile(indexedFile.id, metadata)
        await this.databaseService.deleteFileExifMetadata({
          indexedFileId: indexedFile.id,
        })
        await this.databaseService.deleteFileHashes({
          indexedFileId: indexedFile.id,
        })
      } else {
        this.logger.info(`File ${indexedFile.path} has changed`)
      }
    } else {
      this.logger.debug(`File ${indexedFile.path} is unchanged`)
      await this.databaseService.updateFileValidity({
        indexedFileId: indexedFile.id,
      })
    }
  }

  async extractMissingExif({
    limit,
    minutes,
  }: {
    limit?: number
    minutes?: number
  }): Promise<void> {
    const filesWithoutExif = this.databaseService.findFilesWithoutExif(10)

    for await (const file of filesWithoutExif) {
      await this.extractExif({indexedFile: file})
      this.metrics.exifExtracted++

      if (limit !== undefined && this.metrics.exifExtracted >= limit) {
        break
      }
      // Time limit reached?
      if (minutes !== undefined && this.elapsedMinutes() > minutes) {
        break
      }
    }
  }

  async extractExif({indexedFile}: {indexedFile: IndexedFile}) {
    this.logger.debug(`Extracting EXIF from ${indexedFile.path}`)
    const exif = await extractExif(indexedFile.path)
    this.logger.debug(`Storing EXIF data for ${indexedFile.path}`)
    await this.databaseService.createExifMetadata({
      exifMetadata: {
        fileId: indexedFile.id,
        ...exif,
      },
    })
  }

  async computeMissingHashes({
    path,
    limit,
    minutes,
    hashingAlgorithms,
    withProgress,
  }: {
    path?: string
    limit?: number
    minutes?: number
    hashingAlgorithms: HashingAlgorithmType[]
    withProgress: boolean
  }): Promise<void> {
    const spinner = withProgress
      ? ora({
          text: `Computing missing hashes`,
        })
      : null

    for await (const algorithm of hashingAlgorithms) {
      this.logger.debug(
        `Looking for files missing ${algorithm} hashes${
          path ? ` in ${path}` : ''
        }`
      )

      const count = await this.databaseService.countFilesWithMissingHashes({
        algorithm,
        path,
      })

      this.logger.debug(
        `Found ${count} files missing ${algorithm} hashes${
          path ? ` in ${path}` : ''
        }`
      )

      const filesWithoutHashes =
        this.databaseService.findFilesWithMissingHashes({
          algorithm,
          pageSize: 200,
          path,
        })

      spinner?.start(`Hashing`)
      for await (const file of filesWithoutHashes) {
        this.logger.debug(
          `[${this.metrics.filesHashed}] Processing ${file.path} for ${algorithm} hash`
        )

        try {
          if (spinner) {
            spinner.text = `[${this.metrics.filesHashed}/${count}] Hashing ${file.path}`
          }

          await this.hashFile({indexedFile: file, hashingAlgorithm: algorithm})
          this.logger.debug(
            `[${this.metrics.filesHashed}/${count}] Hashed. ${Math.floor(
              this.elapsedSeconds() / 60
            )}m`
          )
        } catch (error) {
          this.logger.error(`Error hashing ${file.path} for ${algorithm}`)
          this.logger.error(`${error}`)
        }

        if (limit !== undefined && this.metrics.filesHashed >= limit) {
          this.logger.debug(`Reached file limit of ${limit}`)
          break
        }
        // Time limit reached?
        if (minutes !== undefined && this.elapsedMinutes() > minutes) {
          this.logger.debug(`Reached time limit of ${minutes} minutes`)
          break
        }
      }
      spinner?.stop()
    }
  }
}
