import {walkFiles} from '@hwaterke/file-utils'
import nodePath from 'node:path'
import {MEDIA_EXT_SET, RAW_EXT_SET} from './constants.ts'
import {parseTimestampedName, splitStem, type TimestampedName} from './names.ts'

export type RejectReason = 'unknown_type' | 'no_date_prefix'

export type ScannedFile = {
  /** Absolute path to the file in the source tree. */
  path: string
  /** Basename, which is also the destination name — the tree is flattened. */
  name: string
  ext: string
  isRaw: boolean
  parsed: TimestampedName
}

export type RejectedFile = {
  path: string
  name: string
  reason: RejectReason
}

export type ScanResult = {
  files: ScannedFile[]
  rejected: RejectedFile[]
}

/**
 * Walk the source recursively and classify every file (decisions 3, 9, 10).
 * The folder shape is ignored: only the name and the flags decide where a file
 * lands. Hidden files are skipped by the walker, as are symlinked directories.
 */
export async function scanSource(source: string): Promise<ScanResult> {
  const files: ScannedFile[] = []
  const rejected: RejectedFile[] = []

  await walkFiles({
    path: source,
    sort: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
    callback: async (filePath) => {
      const name = nodePath.basename(filePath)
      const {stem, ext} = splitStem(name)

      if (!MEDIA_EXT_SET.has(ext)) {
        rejected.push({path: filePath, name, reason: 'unknown_type'})
        return
      }

      const parsed = parseTimestampedName(stem)
      if (parsed === null) {
        rejected.push({path: filePath, name, reason: 'no_date_prefix'})
        return
      }

      files.push({
        path: filePath,
        name,
        ext,
        isRaw: RAW_EXT_SET.has(ext),
        parsed,
      })
    },
  })

  return {files, rejected}
}
