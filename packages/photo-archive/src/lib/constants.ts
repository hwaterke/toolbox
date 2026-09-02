/** RAW extensions (lowercase, no dot; compared case-insensitively). */
export const RAW_EXTS = ['nef', 'dng'] as const

/** Viewable-photo extensions that count as a pair (HEIC covers iPhone ProRAW). */
export const PHOTO_EXTS = ['jpg', 'jpeg', 'heic'] as const

/** Everything the ingest command is willing to move. Anything else is ignored. */
export const MEDIA_EXTS = [
  ...PHOTO_EXTS,
  ...RAW_EXTS,
  'png',
  'mov',
  'mp4',
  'srt',
] as const

/** The excluded sibling folder paired RAWs are moved into. */
export const BUCKET = 'raw_versions'

/** Pass-2 pairing window: paired timestamps must be within this many seconds. */
export const PAIR_WINDOW_SECONDS = 5

export const RAW_EXT_SET: ReadonlySet<string> = new Set(RAW_EXTS)
export const PHOTO_EXT_SET: ReadonlySet<string> = new Set(PHOTO_EXTS)
export const MEDIA_EXT_SET: ReadonlySet<string> = new Set(MEDIA_EXTS)
