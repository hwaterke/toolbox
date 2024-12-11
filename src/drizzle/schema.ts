import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import {relations, sql} from 'drizzle-orm'
import {createId} from '@paralleldrive/cuid2'
import {HashingAlgorithmType} from '../services/HashingService.js'

export const indexedFileTable = sqliteTable(
  'file',
  {
    id: text('id', {
      length: 24,
    })
      .primaryKey()
      .notNull()
      .$defaultFn(() => createId()),
    path: text('path').notNull(),
    size: integer('size').notNull(),
    mtime: integer('mtime', {mode: 'timestamp'}).notNull(),
    basename: text('basename').notNull(),
    extension: text('extension'),
    validatedAt: integer('validated_at', {mode: 'timestamp'}).notNull(),
    createdAt: integer('created_at', {mode: 'timestamp'})
      .default(sql`(datetime('now'))`)
      .notNull(),
    updatedAt: integer('updated_at', {mode: 'timestamp'})
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (table) => ({
    extensionIdx: index('extension_idx').on(table.extension),
  })
)

export const exifTable = sqliteTable('exif', {
  fileId: text('file_id', {length: 24})
    .notNull()
    .primaryKey()
    .references(() => indexedFileTable.id, {onDelete: 'cascade'}),
  make: text('make'),
  model: text('model'),
  width: integer('width'),
  height: integer('height'),
  exifDate: text('exif_date'),
  livePhotoSource: text('live_photo_source'),
  livePhotoTarget: text('live_photo_target'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  createdAt: integer('created_at', {mode: 'timestamp'})
    .default(sql`(datetime('now'))`)
    .notNull(),
})

export const hashTable = sqliteTable(
  'hash',
  {
    fileId: text('file_id', {length: 24})
      .notNull()
      .references(() => indexedFileTable.id, {onDelete: 'cascade'}),
    algorithm: text('algorithm').$type<HashingAlgorithmType>().notNull(),
    version: text('version').notNull(),
    value: text('value').notNull(),
    validatedAt: integer('validated_at', {mode: 'timestamp'}).notNull(),
    createdAt: integer('created_at', {mode: 'timestamp'})
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.algorithm, table.version, table.fileId],
      name: 'hash_algorithm_file_id_pk',
    }),
    fileIdIdx: index('file_id_idx').on(table.fileId),
    algorithmIdx: index('algorithm_idx').on(table.algorithm),
  })
)

export const fileRelations = relations(indexedFileTable, ({one, many}) => ({
  exif: one(exifTable, {
    fields: [indexedFileTable.id],
    references: [exifTable.fileId],
  }),
  hashes: many(hashTable),
}))

export const exifRelations = relations(exifTable, ({one}) => ({
  file: one(indexedFileTable, {
    fields: [exifTable.fileId],
    references: [indexedFileTable.id],
  }),
}))

export const hashRelations = relations(hashTable, ({one}) => ({
  file: one(indexedFileTable, {
    fields: [hashTable.fileId],
    references: [indexedFileTable.id],
  }),
}))

export type IndexedFile = typeof indexedFileTable.$inferSelect
export type InsertIndexedFile = typeof indexedFileTable.$inferInsert

export type Exif = typeof exifTable.$inferSelect
export type InsertExif = typeof exifTable.$inferInsert

export type Hash = typeof hashTable.$inferSelect
export type InsertHash = typeof hashTable.$inferInsert

export type IndexedFileWithHashes = IndexedFile & {hashes: Hash[]}
