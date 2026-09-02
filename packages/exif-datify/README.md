# exif-datify

CLI to rename files with date and time information from Exif data

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/exif-datify.svg)](https://npmjs.org/package/exif-datify)
[![Downloads/week](https://img.shields.io/npm/dw/exif-datify.svg)](https://npmjs.org/package/exif-datify)
[![License](https://img.shields.io/npm/l/exif-datify.svg)](https://github.com/hwaterke/exif-datify/blob/master/package.json)

<!-- toc -->

- [exif-datify](#exif-datify)
- [Usage](#usage)
- [Commands](#commands)
<!-- tocstop -->

# Usage

<!-- usage -->

```sh-session
$ npm install -g exif-datify
$ exif-datify COMMAND
running command...
$ exif-datify (--version)
exif-datify/0.0.10 darwin-arm64 node-v18.17.1
$ exif-datify --help [COMMAND]
USAGE
  $ exif-datify COMMAND
...
```

<!-- usagestop -->

# Commands

<!-- commands -->

- [`exif-datify dji-shift PATH`](#exif-datify-dji-shift-path)
- [`exif-datify help [COMMANDS]`](#exif-datify-help-commands)
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
[dist/commands/dji-shift.ts](https://github.com/hwaterke/exif-datify/blob/v0.0.10/dist/commands/dji-shift.ts)_

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
  -p, --prefix=<value>      [default: yyyy-MM-dd_HH-mm-ss_] Format used for the prefix, see luxon documentation
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
[dist/commands/rename.ts](https://github.com/hwaterke/exif-datify/blob/v0.0.10/dist/commands/rename.ts)_

<!-- commandsstop -->
