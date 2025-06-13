import {
  and,
  asc,
  count,
  eq,
  gt,
  inArray,
  isNull,
  like,
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

  async countFilesWithMissingHashes(
    algorithm: HashingAlgorithmType
  ): Promise<number> {
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
            : undefined
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
  }: {
    algorithm: HashingAlgorithmType
    pageSize: number
    path?: string
  }): AsyncGenerator<IndexedFile> {
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

  async findFilesBySize(size: number) {
    return this.db.query.indexedFileTable.findMany({
      where: eq(indexedFileTable.size, size),
      with: {
        hashes: true,
      },
    })
  }

  async findFilesByHashValue(
    algorithm: HashingAlgorithmType,
    hash: string
  ): Promise<IndexedFile[]> {
    const results = await this.db
      .select()
      .from(schema.hashTable)
      .innerJoin(
        indexedFileTable,
        eq(schema.hashTable.fileId, indexedFileTable.id)
      )
      .where(
        and(
          eq(schema.hashTable.algorithm, algorithm),
          eq(schema.hashTable.value, hash)
        )
      )

    return results.map((result) => result.file)
  }

  async findFilesByPrefix(prefix: string): Promise<IndexedFile[]> {
    return this.db.query.indexedFileTable.findMany({
      where: like(indexedFileTable.basename, `${prefix}%`),
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
