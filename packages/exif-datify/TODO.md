# TODOS

## Doctor command

- Fix time shift of DJI videos
- TZ in photos
  - Add the TZ tag to the file
  - Do a setAllTime with the TZ tag to update
- Gopro videos: Set all time to the createdate with tz of +2 + add the
  creationdate as well with TZ!

## Time zones

- Photos have an exif field to store the TZ offset
- QuickTime CreationDate contains the TZ offset for videos

We can get the offset from the IANA name (when provided through command line)

```typescript
const luxonTime = DateTime.fromFormat(
  quicktimeTime,
  EXIF_DATE_TIME_FORMAT_WITH_TZ,
  {zone: 'Europe/Lisbon'}
)

const correctTimeString = luxonTime.toFormat(EXIF_DATE_TIME_FORMAT_WITH_TZ)
```

For photos

```typescript
exifService.setTimezoneOffsets()
exifService.setAllTime()
```

There seems to be something to do with the sub sec as well

```typescript
// Set subsec
const subSec = metadata['EXIF:ExifIFD:SubSecTime']
if (typeof subSec === 'number') {
  await exifService.exiftool(
    `-overwrite_original -P -SubSecTime=${subSec} -SubSecTimeOriginal=${subSec} -SubSecTimeDigitized=${subSec} "${entry}"`
  )
}
```
