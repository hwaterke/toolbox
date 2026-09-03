/** RAW extensions (lowercase, no dot; compared case-insensitively). */
export const RAW_EXTS = ['nef', 'dng'] as const

/** Viewable-photo extensions that count as a pair (HEIC covers iPhone ProRAW). */
export const PHOTO_EXTS = ['jpg', 'jpeg', 'heic'] as const

/** Everything the ingest command is willing to move. Anything else is ignored. */
export const MEDIA_EXTS = [
  ...PHOTO_EXTS,
  ...RAW_EXTS,
  'png',
  'tif',
  'mov',
  'mp4',
  'm4v',
  'mpg',
  'mts',
  'avi',
  'wmv',
  'flv',
  '3gp',
  'srt',
] as const

/**
 * Clutter left beside media by cameras and photo apps. Never moved by `ingest`;
 * `lint` reports it as a backlog to delete.
 */
export const SIDECAR_EXTS = ['thm', 'xmp', 'aae'] as const

/** The excluded sibling folder paired RAWs are moved into. */
export const BUCKET = 'raw_versions'

/**
 * Stitched-panorama sets, allowed inside `footage/` and inside `raw_versions/`.
 * A reserved lowercase name, matched exactly: `dji-panorama` and `dji-PANORAMA`
 * are ordinary source folders, not this (T4). Never linted inside, and its
 * contents nest one level deeper than anything else (T3).
 */
export const PANORAMA = 'panorama'

/** Folder names that are reserved rather than source folders. */
export const RESERVED_FOLDERS: ReadonlySet<string> = new Set([BUCKET, PANORAMA])

/** Pass-2 pairing window: paired timestamps must be within this many seconds. */
export const PAIR_WINDOW_SECONDS = 5

export const RAW_EXT_SET: ReadonlySet<string> = new Set(RAW_EXTS)
export const PHOTO_EXT_SET: ReadonlySet<string> = new Set(PHOTO_EXTS)
export const MEDIA_EXT_SET: ReadonlySet<string> = new Set(MEDIA_EXTS)
export const SIDECAR_EXT_SET: ReadonlySet<string> = new Set(SIDECAR_EXTS)
