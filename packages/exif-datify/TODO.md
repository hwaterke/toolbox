# TODOS

## Doctor command

- Fix time shift of DJI videos

## exif-datify follow-ups

- Speed: run exiftool with `-stay_open` instead of one process per file, and/or
  process files concurrently. Deliberately left out of the nikon/gopro pass so
  the tests landed first.
- GoPro `--verify-gps`: cross-check the `--zone` the user passed against the
  GPS/UTC timestamps in the telemetry. Costly, because `exiftool -ee` reads the
  whole video file.
- Migrate off Luxon to Temporal (`temporal-polyfill`). Temporal carries
  nanosecond precision, which removes the millisecond-truncation hazard Luxon
  has with sub-second EXIF values. The "copy the sub-second digits verbatim"
  rule stays correct either way, so nothing needs redoing after the migration.
