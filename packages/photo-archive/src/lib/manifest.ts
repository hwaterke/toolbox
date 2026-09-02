import {promises as fs} from 'node:fs'
import nodePath from 'node:path'

export type ManifestEntry = {
  /** ISO timestamp of the move. */
  at: string
  from: string
  to: string
}

/**
 * A crash-safe JSON Lines record of every completed move (decisions 14, 25).
 * Each line is appended and fsync'd before the next file is touched, so an
 * interrupted run still has a complete record of what it did.
 */
export class Manifest {
  private handle: fs.FileHandle | null = null

  readonly path: string

  constructor(path: string) {
    this.path = path
  }

  async append(entry: ManifestEntry): Promise<void> {
    if (this.handle === null) {
      await fs.mkdir(nodePath.dirname(this.path), {recursive: true})
      this.handle = await fs.open(this.path, 'a')
    }
    await this.handle.write(`${JSON.stringify(entry)}\n`)
    await this.handle.sync()
  }

  async close(): Promise<void> {
    await this.handle?.close()
    this.handle = null
  }

  /** True when nothing was ever written, so the file was never created. */
  get isEmpty(): boolean {
    return this.handle === null
  }
}

/** Parse a manifest file, ignoring blank lines. Throws on a malformed line. */
export async function readManifest(path: string): Promise<ManifestEntry[]> {
  const contents = await fs.readFile(path, 'utf8')
  const entries: ManifestEntry[] = []
  let lineNumber = 0
  for (const line of contents.split('\n')) {
    lineNumber += 1
    const trimmed = line.trim()
    if (trimmed === '') {
      continue
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      throw new Error(`${path}:${lineNumber} is not valid JSON`)
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as ManifestEntry).from !== 'string' ||
      typeof (parsed as ManifestEntry).to !== 'string'
    ) {
      throw new Error(`${path}:${lineNumber} is not a manifest entry`)
    }
    entries.push(parsed as ManifestEntry)
  }
  return entries
}

/** `photo-archive_20260902-214500.manifest.jsonl` in `directory`. */
export function manifestPath(directory: string, now: Date): string {
  return nodePath.join(directory, `photo-archive_${stamp(now)}.manifest.jsonl`)
}

/** `photo-archive_20260902-214500.log` in `directory`. */
export function logPath(directory: string, now: Date): string {
  return nodePath.join(directory, `photo-archive_${stamp(now)}.log`)
}

function stamp(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  )
}
