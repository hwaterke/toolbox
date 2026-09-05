# exif-datify

CLI to rename files with date and time information from Exif data

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)

<!-- toc -->

- [exif-datify](#exif-datify)
- [Usage](#usage)
- [Fixing camera times](#fixing-camera-times)
- [Commands](#commands)

<!-- tocstop -->

# Usage

<!-- usage -->

Not published. See the [root README](../../README.md) for the symlink that puts
`exif-datify` on your PATH.

```sh-session
$ exif-datify COMMAND
running command...
$ exif-datify --help [COMMAND]
```

<!-- usagestop -->

# Fixing camera times

`nikon` and `gopro` both work the same way. They read a file, work out what its
time tags should say, compare that against what is there, and write only what
differs. Running either one twice is safe: the second run writes nothing.

Each file gets one verdict, and the run ends with a summary.

| Verdict    | Meaning                                                             |
| ---------- | ------------------------------------------------------------------- |
| `ok`       | Already correct. Nothing written.                                   |
| `written`  | Tags were missing or wrong, and were written.                       |
| `repaired` | The same, plus it undid damage left by an older version.            |
| `ignored`  | Not a file the command owns: wrong extension, wrong camera.         |
| `skipped`  | The command could not prove the offset, so it wrote nothing.        |
| `failed`   | The file is malformed in a way the command refuses to guess around. |

Full paths are printed for everything `skipped` or `failed`, since those are the
files you have to go and look at. The rest are counted. A run with any failure
exits non-zero. There is no backup flag: to see what a run would do, run it with
`--dryRun` first and read the summary.

## `nikon`

The camera is the default source of truth. A Nikon stores the base zone in
`MakerNotes:Nikon:TimeZone` with DST excluded, plus a `DaylightSavings` flag, so
the true offset can be derived without `--zone`. Pass `--zone` to override it.

When the camera and `--zone` disagree the file is skipped and nothing is
written, because "the label was wrong" and "the clock was wrong" look identical
in the file. Pass `--convertZone` to keep the recorded instant and re-express it
in `--zone` instead. That rewrites the MakerNotes too, so a second run sees
agreement and does nothing: the conversion converges rather than shifting twice.

Repairs are automatic. An older version of this tool wrote a correct
`OffsetTimeOriginal` and then also overwrote `Nikon:TimeZone` with it, which is
wrong: that tag must stay at the base zone. `nikon` detects those files and
restores the base zone.

## `gopro`

A GoPro records no time zone at all, so `--zone` is required and is taken on
trust.

On videos, `QuickTime:Keys:CreationDate` is the anchor: it is the only tag that
carries an offset, the camera never writes it and this command always does.
Every other time tag is checked against that anchor and stored in UTC, in one
exiftool call. **Never strip that anchor from a processed file.** It is the only
record of which convention the file follows - nothing else in a GoPro MP4 says
whether the stored dates are local or UTC, so a stripped file cannot be told
apart from a camera-fresh one.

Photos get the three offset tags. A `.GPR` also gets its `CreateDate` replaced
with its `DateTimeOriginal`, because the camera writes a firmware date there
rather than a capture time.

Videos are `.MOV` and `.MP4`, photos are `.JPG` and `.GPR`. Anything else, and
any file from another camera, is counted as `ignored` rather than dropped
silently.

## `find-low-resolution`

Finds the shrunken copies SnapBridge leaves behind. The phone app syncs a
downscaled version of each shot, and those copies land in the backups next to
the real files: same camera model, a fraction of the pixels. Reporting is the
default and deleting is opt-in, because size is the only thing separating a
phone copy from a real photo.

# Commands

<!-- commands -->

- [`exif-datify dji-shift PATH`](#exif-datify-dji-shift-path)
- [`exif-datify find-low-resolution PATH`](#exif-datify-find-low-resolution-path)
- [`exif-datify gopro PATH`](#exif-datify-gopro-path)
- [`exif-datify help [COMMANDS]`](#exif-datify-help-commands)
- [`exif-datify nikon PATH`](#exif-datify-nikon-path)
- [`exif-datify rename PATH`](#exif-datify-rename-path)

## `exif-datify dji-shift PATH`

shifts the time of all files in a directory by one/two hour

```
USAGE
  $ exif-datify dji-shift PATH [-d]

ARGUMENTS
  PATH  path to file or directory to process

FLAGS
  -d, --dryRun  dry run

DESCRIPTION
  shifts the time of all files in a directory by one/two hour
```

_See code:
[dist/commands/dji-shift.ts](https://github.com/hwaterke/toolbox/blob/master/packages/exif-datify/src/commands/dji-shift.ts)_

## `exif-datify find-low-resolution PATH`

find (and optionally delete) low resolution copies of photos

```
USAGE
  $ exif-datify find-low-resolution PATH [-m <value>] [--maxMegapixels <value>] [--delete]

ARGUMENTS
  PATH  path to file or directory to process

FLAGS
  -m, --model=<value>          [default: NIKON D3500] only consider files shot with this camera model
      --delete                 delete the files found instead of only reporting them
      --maxMegapixels=<value>  [default: 10] report files below this many megapixels

DESCRIPTION
  find (and optionally delete) low resolution copies of photos
```

_See code:
[src/commands/find-low-resolution.ts](https://github.com/hwaterke/toolbox/blob/master/packages/exif-datify/src/commands/find-low-resolution.ts)_

## `exif-datify gopro PATH`

write proper time for GoPro files

```
USAGE
  $ exif-datify gopro PATH -z <value> [-d]

ARGUMENTS
  PATH  path to file or directory to process

FLAGS
  -d, --dryRun        dry run
  -z, --zone=<value>  (required) IANA time zone where the pictures/videos were taken e.g. Europe/Brussels. Required: a
                      GoPro records no time zone of its own

DESCRIPTION
  write proper time for GoPro files
```

_See code:
[src/commands/gopro.ts](https://github.com/hwaterke/toolbox/blob/master/packages/exif-datify/src/commands/gopro.ts)_

## `exif-datify help [COMMANDS]`

Display help for exif-datify.

```
USAGE
  $ exif-datify help [COMMANDS] [-n]

ARGUMENTS
  COMMANDS  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for exif-datify.
```

_See code:
[@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v5.2.13/src/commands/help.ts)_

## `exif-datify nikon PATH`

write proper time for Nikon files

```
USAGE
  $ exif-datify nikon PATH [-d] [--convertZone -z <value>]

ARGUMENTS
  PATH  path to file or directory to process

FLAGS
  -d, --dryRun        dry run
  -z, --zone=<value>  IANA time zone where the pictures were taken e.g. Europe/Brussels. Defaults to what the camera
                      recorded
      --convertZone   when the camera and --zone disagree, keep the instant and re-express it in --zone instead of
                      skipping the file

DESCRIPTION
  write proper time for Nikon files
```

_See code:
[src/commands/nikon.ts](https://github.com/hwaterke/toolbox/blob/master/packages/exif-datify/src/commands/nikon.ts)_

## `exif-datify rename PATH`

rename files with date and time information from Exif data

```
USAGE
  $ exif-datify rename PATH [-d] [-p <value>] [-e <value>] [-z <value>] [-b] [-t] [--srt] [--livePhotoInfix
    <value>] [-r]

ARGUMENTS
  PATH  path to file or directory to process

FLAGS
  -b, --skipBasename        skip the basename of the file
  -d, --dryRun              show how files would be renamed without doing it
  -e, --extensions=<value>  which file extensions to process (comma separated) e.g. (mov,mp4,jpg)
  -p, --prefix=<value>      [default: yyyy-MM-dd_HH-mm-ss_] format for the date prefix. Tokens: yyyy MM dd HH mm ss SSS
                            uu ZZ. Anything else is literal
  -r, --recursive           process directories recursively
  -t, --time                fallback to the time of the file when no date and time is found
  -z, --zone=<value>        which IANA time zone to use for the date and time information found in UTC (default is local
                            time) e.g. Europe/Brussels
  --livePhotoInfix=<value>  adds an infix to the videos of a live photo (after the date prefix and before the original
                            filename)
  --srt                     rename .srt files with the same date as the video they share their name with.

DESCRIPTION
  rename files with date and time information from Exif data
```

_See code:
[dist/commands/rename.ts](https://github.com/hwaterke/toolbox/blob/master/packages/exif-datify/src/commands/rename.ts)_

<!-- commandsstop -->
