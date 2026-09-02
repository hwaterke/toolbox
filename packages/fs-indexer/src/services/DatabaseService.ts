import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  like,
  lt,
  or,
  sql,
  sum,
} from 'drizzle-orm'
import {drizzle, LibSQLDatabase} from 'drizzle-orm/libsql'
import {migrate} from 'drizzle-orm/libsql/migrator'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import * as schema from '../drizzle/schema.js'
import {
  IndexedFile,
  indexedFileTable,
  IndexedFileWithHashes,
  InsertExif,
  InsertIndexedFile,
} from '../drizzle/schema.js'
import {ExifMetadata} from '../utils.js'
import {HashingAlgorithmByType, HashingAlgorithmType} from './HashingService.js'
import {LoggerService} from './LoggerService.js'

export class DatabaseService {
  private readonly db: LibSQLDatabase<typeof schema>

  constructor(databasePath: string) {
    const logger = LoggerService.getLogger()

    this.db = drizzle(`file:${databasePath}`, {
      schema,
      logger: {
        logQuery: (query, params) => {
          const stringifiedParams = params.map((p) => {
            try {
              return JSON.stringify(p)
            } catch {
              return String(p)
            }
          })
          const paramsStr =
            stringifiedParams.length > 0
              ? ` -- params: [${stringifiedParams.join(', ')}]`
              : ''
          logger.debug(`${query}${paramsStr}`)
        },
      },
    })
  }

  async init() {
    await migrate(this.db, {
      migrationsFolder: resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../drizzle/migrations'
      ),
    })
  }

  getDatabase() {
    return this.db
  }

  async createFile(file: InsertIndexedFile) {
    return this.db
      .insert(indexedFileTable)
      .values({
        ...file,
        extension:
          file.extension === null ? null : file.extension?.toLowerCase(),
      })
      .returning({
        id: indexedFileTable.id,
        path: indexedFileTable.path,
      })
  }

  async createFileIfNotExists(file: InsertIndexedFile): Promise<{
    id: string
    path: string
    wasCreated: boolean
  } | null> {
    const result = await this.db
      .insert(indexedFileTable)
      .values({
        ...file,
        extension:
          file.extension === null ? null : file.extension?.toLowerCase(),
      })
      .onConflictDoNothing({target: indexedFileTable.path})
      .returning({
        id: indexedFileTable.id,
        path: indexedFileTable.path,
      })

    // If result is empty, the file already existed
    if (result.length === 0) {
      return null
    }

    return {
      ...result[0],
      wasCreated: true,
    }
  }

  async createFilesIfNotExists(files: InsertIndexedFile[]): Promise<{
    created: Array<{id: string; path: string}>
    skipped: string[]
  }> {
    if (files.length === 0) {
      return {created: [], skipped: []}
    }

    const result = await this.db
      .insert(indexedFileTable)
      .values(
        files.map((file) => ({
          ...file,
          extension:
            file.extension === null ? null : file.extension?.toLowerCase(),
        }))
      )
      .onConflictDoNothing({target: indexedFileTable.path})
      .returning({
        id: indexedFileTable.id,
        path: indexedFileTable.path,
      })

    const createdPaths = new Set(result.map((r) => r.path))
    const skipped = files
      .map((f) => f.path)
      .filter((path) => !createdPaths.has(path))

    return {
      created: result,
      skipped,
    }
  }

  async updateFile(id: string, file: InsertIndexedFile) {
    return this.db
      .update(indexedFileTable)
      .set({
        ...file,
        extension:
          file.extension === null ? null : file.extension?.toLowerCase(),
      })
      .where(eq(indexedFileTable.id, id))
  }

  async updateFileExifMetadata({
    indexedFileId,
    exifMetadata,
  }: {
    indexedFileId: string
    exifMetadata: ExifMetadata
  }): Promise<void> {
    await this.db
      .update(indexedFileTable)
      .set({
        ...exifMetadata,
        updatedAt: new Date(),
      })
      .where(eq(indexedFileTable.id, indexedFileId))
  }

  async deleteFile({indexedFileId}: {indexedFileId: string}): Promise<void> {
    await this.db
      .delete(indexedFileTable)
      .where(eq(indexedFileTable.id, indexedFileId))
  }

  async updateFileValidity({
    indexedFileId,
  }: {
    indexedFileId: string
  }): Promise<void> {
    await this.db
      .update(indexedFileTable)
      .set({validatedAt: new Date(), updatedAt: new Date()})
      .where(eq(indexedFileTable.id, indexedFileId))
  }

  async deleteFileExifMetadata({
    indexedFileId,
  }: {
    indexedFileId: string
  }): Promise<void> {
    await this.db
      .delete(schema.exifTable)
      .where(eq(schema.exifTable.fileId, indexedFileId))
  }

  async deleteFileHashes({
    indexedFileId,
  }: {
    indexedFileId: string
  }): Promise<void> {
    await this.db
      .delete(schema.hashTable)
      .where(eq(schema.hashTable.fileId, indexedFileId))
  }

  async createExifMetadata({
    exifMetadata,
  }: {
    exifMetadata: InsertExif
  }): Promise<void> {
    await this.db.insert(schema.exifTable).values(exifMetadata)
  }

  async *findFilesWithoutExif(pageSize: number): AsyncGenerator<IndexedFile> {
    let lastId: string | null = null

    while (true) {
      const results = await this.db
        .select()
        .from(indexedFileTable)
        .leftJoin(
          schema.exifTable,
          eq(indexedFileTable.id, schema.exifTable.fileId)
        )
        .where(
          and(
            lastId ? gt(indexedFileTable.id, lastId) : undefined,
            isNull(schema.exifTable.fileId)
          )
        )
        .orderBy(indexedFileTable.id)
        .limit(pageSize)

      if (results.length === 0) {
        break
      }

      lastId = results.at(-1)?.file.id ?? null

      for (const file of results) {
        yield file.file
      }
    }
  }

  async countFilesWithMissingHashes({
    algorithm,
    path,
  }: {
    algorithm: HashingAlgorithmType
    path?: string
  }): Promise<number> {
    const hashingAlgorithm = HashingAlgorithmByType[algorithm]
    const results = await this.db
      .select({count: count()})
      .from(indexedFileTable)
      .leftJoin(
        schema.hashTable,
        and(
          eq(indexedFileTable.id, schema.hashTable.fileId),
          eq(schema.hashTable.algorithm, algorithm)
        )
      )
      .where(
        and(
          isNull(schema.hashTable.fileId),
          hashingAlgorithm.supportedFileTypes
            ? inArray(
                indexedFileTable.extension,
                hashingAlgorithm.supportedFileTypes
              )
            : undefined,
          path ? like(indexedFileTable.path, `${path}%`) : undefined
        )
      )

    if (results.length === 0) {
      return 0
    }

    return results[0].count
  }

  async *findFilesWithMissingHashes({
    algorithm,
    pageSize,
    path,
    orderByPathDesc,
  }: {
    algorithm: HashingAlgorithmType
    pageSize: number
    path?: string
    orderByPathDesc?: boolean
  }): AsyncGenerator<IndexedFile> {
    if (orderByPathDesc) {
      let lastPath: string | null = null

      while (true) {
        const results = await this.db
          .select()
          .from(indexedFileTable)
          .where(
            and(
              lastPath ? lt(indexedFileTable.path, lastPath) : undefined,
              sql`NOT EXISTS (SELECT 1 FROM ${schema.hashTable} WHERE ${schema.hashTable.fileId} = ${indexedFileTable.id} AND ${schema.hashTable.algorithm} = ${algorithm})`,
              path ? like(indexedFileTable.path, `${path}%`) : undefined
            )
          )
          .orderBy(desc(indexedFileTable.path))
          .limit(pageSize)

        if (results.length === 0) {
          break
        }

        for (const file of results) {
          lastPath = file.path
          yield file
        }
      }
    } else {
      let lastId: string | null = null

      while (true) {
        const results = await this.db
          .select()
          .from(indexedFileTable)
          .where(
            and(
              lastId ? gt(indexedFileTable.id, lastId) : undefined,
              sql`NOT EXISTS (SELECT 1 FROM ${schema.hashTable} WHERE ${schema.hashTable.fileId} = ${indexedFileTable.id} AND ${schema.hashTable.algorithm} = ${algorithm})`,
              path ? like(indexedFileTable.path, `${path}%`) : undefined
            )
          )
          .orderBy(indexedFileTable.id)
          .limit(pageSize)

        if (results.length === 0) {
          break
        }

        for (const file of results) {
          lastId = file.id
          yield file
        }
      }
    }
  }

  async createHash({
    indexedFileId,
    algorithm,
    version,
    hash,
  }: {
    indexedFileId: string
    algorithm: HashingAlgorithmType
    version: string
    hash: string
  }): Promise<void> {
    await this.db.insert(schema.hashTable).values({
      fileId: indexedFileId,
      algorithm,
      version,
      value: hash,
      validatedAt: new Date(),
    })
  }

  async updateHashValidity(
    fileUuid: string,
    algorithm: HashingAlgorithmType
  ): Promise<void> {
    await this.db
      .update(schema.hashTable)
      .set({validatedAt: new Date()})
      .where(
        and(
          eq(schema.hashTable.fileId, fileUuid),
          eq(schema.hashTable.algorithm, algorithm)
        )
      )
  }

  async findFile(path: string) {
    const result = await this.db.query.indexedFileTable.findFirst({
      where: eq(indexedFileTable.path, path),
      with: {
        hashes: true,
      },
    })
    return result ?? null
  }

  async findFilesBySize(size: number, originalPaths?: string[]) {
    const conditions = [eq(indexedFileTable.size, size)]

    // Add path filtering if original paths are provided
    if (originalPaths && originalPaths.length > 0) {
      conditions.push(
        or(
          ...originalPaths.map((path) =>
            like(indexedFileTable.path, `${path}%`)
          )
        )!
      )
    }

    return this.db.query.indexedFileTable.findMany({
      where: and(...conditions),
      with: {
        hashes: true,
      },
    })
  }

  async findFilesByHashValue(
    algorithm: HashingAlgorithmType,
    hash: string,
    originalPaths?: string[]
  ): Promise<IndexedFile[]> {
    const conditions = [
      eq(schema.hashTable.algorithm, algorithm),
      eq(schema.hashTable.value, hash),
    ]

    // Add path filtering if original paths are provided
    if (originalPaths && originalPaths.length > 0) {
      const pathConditions = originalPaths.map((path) =>
        like(indexedFileTable.path, `${path}%`)
      )
      conditions.push(
        or(
          ...pathConditions.map((path) =>
            like(indexedFileTable.path, `${path}%`)
          )
        )!
      )
    }

    const results = await this.db
      .select()
      .from(schema.hashTable)
      .innerJoin(
        indexedFileTable,
        eq(schema.hashTable.fileId, indexedFileTable.id)
      )
      .where(and(...conditions))

    return results.map((result) => result.file)
  }

  async findFilesByPrefix(
    prefix: string,
    originalPaths?: string[]
  ): Promise<IndexedFile[]> {
    const conditions = [like(indexedFileTable.basename, `${prefix}%`)]

    // Add path filtering if original paths are provided
    if (originalPaths && originalPaths.length > 0) {
      const pathConditions = originalPaths.map((path) =>
        like(indexedFileTable.path, `${path}%`)
      )
      conditions.push(
        or(
          ...pathConditions.map((path) =>
            like(indexedFileTable.path, `${path}%`)
          )
        )!
      )
    }

    return this.db.query.indexedFileTable.findMany({
      where: and(...conditions),
    })
  }

  async findByValidityInPath({
    count,
    path,
  }: {
    count: number
    path: string
  }): Promise<IndexedFileWithHashes[]> {
    return this.db.query.indexedFileTable.findMany({
      where: like(indexedFileTable.path, `${path}%`),
      limit: count,
      orderBy: asc(indexedFileTable.validatedAt),
      with: {
        hashes: true,
      },
    })
  }

  async totalSize(): Promise<number> {
    const results = await this.db
      .select({totalSize: sum(indexedFileTable.size).mapWith(Number)})
      .from(indexedFileTable)

    if (results.length === 0) {
      return 0
    }
    return results[0].totalSize
  }

  async countFiles(): Promise<number> {
    const results = await this.db
      .select({count: count(indexedFileTable.id)})
      .from(indexedFileTable)

    if (results.length === 0) {
      return 0
    }
    return results[0].count
  }

  async countFilesInPath({path}: {path: string}): Promise<number> {
    const results = await this.db
      .select({count: count(indexedFileTable.id)})
      .from(indexedFileTable)
      .where(like(indexedFileTable.path, `${path}%`))

    if (results.length === 0) {
      return 0
    }
    return results[0].count
  }

  async countHashes(algorithm?: HashingAlgorithmType): Promise<number> {
    const results = await this.db
      .select({count: count()})
      .from(schema.hashTable)
      .where(algorithm ? eq(schema.hashTable.algorithm, algorithm) : undefined)

    if (results.length === 0) {
      return 0
    }
    return results[0].count
  }
}
