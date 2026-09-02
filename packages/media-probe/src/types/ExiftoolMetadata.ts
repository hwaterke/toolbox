export const EXIF_TAGS = {
  // Date and time tags
  FILE_MODIFICATION_DATE: 'File:System:FileModifyDate',
  DATE_TIME_ORIGINAL: 'EXIF:ExifIFD:DateTimeOriginal',
  SUB_SEC_TIME: 'EXIF:ExifIFD:SubSecTime',
  QUICKTIME_CREATE_DATE: 'QuickTime:CreateDate',
  QUICKTIME_CREATION_DATE: 'QuickTime:Keys:CreationDate',
  SUB_SEC_DATE_TIME_ORIGINAL: 'Composite:SubSecDateTimeOriginal',
  GPS_DATE_TIME: 'Composite:GPSDateTime',
  EXIF_OFFSET_TIME: 'EXIF:ExifIFD:OffsetTime',
  EXIF_OFFSET_TIME_ORIGINAL: 'EXIF:ExifIFD:OffsetTimeOriginal',
  EXIF_OFFSET_TIME_DIGITIZED: 'EXIF:ExifIFD:OffsetTimeDigitized',

  // Apple Live Photo. Old tag on the photo file that contains the UUID of the photo that is part of the live photo.
  LIVE_PHOTO_UUID_PHOTO_MEDIA_GROUP: 'MakerNotes:Apple:MediaGroupUUID',
  // Apple Live Photo. New tag on the photo file that contains the UUID of the photo that is part of the live photo.
  LIVE_PHOTO_UUID_PHOTO: 'MakerNotes:Apple:ContentIdentifier',
  // Apple Live Photo. Tag on the video file that contains the UUID of the photo that is part of the live photo.
  LIVE_PHOTO_UUID_VIDEO: 'QuickTime:Keys:ContentIdentifier',

  ORIENTATION: 'EXIF:IFD0:Orientation',
  QUICKTIME_ROTATION: 'QuickTime:Rotation',
  COMPOSITE_ROTATION: 'Composite:Rotation',
  COMPOSITE_MEGAPIXELS: 'Composite:Megapixels',

  // Camera make and models
  EXIF_MAKE: 'EXIF:IFD0:Make',
  QUICKTIME_MAKE: 'QuickTime:Keys:Make',
  EXIF_MODEL: 'EXIF:IFD0:Model',
  QUICKTIME_KEYS_MODEL: 'QuickTime:Keys:Model',
  QUICKTIME_USER_DATA_MODEL: 'QuickTime:UserData:Model',
  GOPRO_MODEL: 'QuickTime:GoPro:Model',
} as const

export type ExiftoolMetadata = {
  [EXIF_TAGS.FILE_MODIFICATION_DATE]?: string
  [EXIF_TAGS.DATE_TIME_ORIGINAL]?: string
  [EXIF_TAGS.QUICKTIME_CREATE_DATE]?: string
  [EXIF_TAGS.QUICKTIME_CREATION_DATE]?: string
  [EXIF_TAGS.LIVE_PHOTO_UUID_PHOTO_MEDIA_GROUP]?: string
  [EXIF_TAGS.LIVE_PHOTO_UUID_PHOTO]?: string
  [EXIF_TAGS.LIVE_PHOTO_UUID_VIDEO]?: string
  [EXIF_TAGS.SUB_SEC_DATE_TIME_ORIGINAL]?: string
  [EXIF_TAGS.GPS_DATE_TIME]?: string
  [EXIF_TAGS.EXIF_OFFSET_TIME]?: string
  [EXIF_TAGS.EXIF_OFFSET_TIME_ORIGINAL]?: string
  [EXIF_TAGS.EXIF_OFFSET_TIME_DIGITIZED]?: string
  [EXIF_TAGS.ORIENTATION]?: string
  [EXIF_TAGS.COMPOSITE_MEGAPIXELS]?: number
  [EXIF_TAGS.EXIF_MAKE]?: string
  [EXIF_TAGS.QUICKTIME_MAKE]?: string
  [EXIF_TAGS.EXIF_MODEL]?: string
  [EXIF_TAGS.QUICKTIME_KEYS_MODEL]?: string
  [EXIF_TAGS.QUICKTIME_USER_DATA_MODEL]?: string
  [EXIF_TAGS.GOPRO_MODEL]?: string
  [key: string]: string | number | undefined
}
