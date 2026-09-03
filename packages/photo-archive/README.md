# photo-archive

CLI to file already-renamed media into the photo archive, and to check the
archive against its layout rules.

`ingest` takes a folder of media whose names already carry a
`YYYY-MM-DD_HH-mm-ss_` prefix — written earlier by
[`exif-datify rename`](../exif-datify) — and moves each file to the right place
in the archive. It never reads Exif: the date comes from the filename alone.

# Installation

Not published. Node 24 runs the TypeScript directly, so there is no build step —
put a symlink to `bin/run.ts` somewhere on your `PATH`:

```sh-session
$ ln -s "$PWD/bin/run.ts" ~/.local/bin/photo-archive
```

# Usage

```sh-session
$ photo-archive ingest <source> <archive-root> [--event NAME] [--source NAME] [--execute]
$ photo-archive undo <manifest.jsonl> [--execute]
$ photo-archive lint <archive-root> [--only PATH]... [--rule ID]... [--strict] [--format json]
```

`ingest` and `undo` move files; `lint` only reads. It has its own section below.

**Dry run is the default.** Nothing moves until you pass `--execute`. The dry
run walks the same code path as a real run — it stats every file, checks every
destination and reports what would happen — so it cannot lie about the outcome.

The archive root is a required argument. Nothing is hardcoded, so
`relations/<person>` works with no extra flag: it uses the same layout.

# Destination shapes

| Flags                  | Destination           | Paired RAW goes to                 |
| ---------------------- | --------------------- | ---------------------------------- |
| none                   | `sorted/YYYY/MM/`     | `sorted/YYYY/MM/raw_versions/`     |
| `--event N`            | `events/N/footage/`   | `events/N/footage/raw_versions/`   |
| `--event N --source S` | `events/N/footage/S/` | `events/N/footage/raw_versions/S/` |

`YYYY` and `MM` come from the filename prefix. The source folder's own shape is
ignored: the walk recurses and flattens, and `--source` is the only way a
sub-folder is named.

## RAW pairing

A `.nef`/`.dng` moves to `raw_versions/` **only when a viewable twin exists** —
a `.jpg`, `.jpeg` or `.heic` of the same shot. A lone RAW lands in the normal
folder instead, so Immich still indexes it: it is the only copy of that photo.

Twins are looked for in the batch being ingested _and_ in the destination
folder, so a RAW whose JPG was filed on an earlier run still gets bucketed. Two
passes run:

1. exact stem match;
2. trailing-token match, accepted only when it is unique and the two timestamps
   are within 5 seconds.

A RAW that matches more than one candidate is reported as ambiguous and left in
place. Nothing is guessed.

# Safety model

- **Dry run by default**, `--execute` to act.
- **Every move is verified.** The mover is `moveFileIntoFolder` from
  `@hwaterke/file-utils`. Across volumes — always the case here, card or Mac to
  NAS — it copies, compares size _and_ sha256, and only then unlinks the source.
- **Nothing is ever overwritten.** An occupied destination is skipped and
  reported. That also covers two batch files that would land on the same name:
  the first moves, the second is reported.
- **Pre-flight before anything moves.** The archive root must already hold
  `events/` or `sorted/`; the source may not be the root itself nor sit inside
  `events/`, `sorted/` or a `raw_versions/`; an `--event` folder must exist
  unless `--create-event` is given, and its name must look like
  `YYYY-MM-DD-Name` (a near miss suggests the folder you probably meant);
  `--source` must be one plain folder name and requires `--event`.
- **`footage/` keeps one layout.** Loose media means flat, sub-folders mean
  grouped, and mixing the two stops the run. So does asking for the wrong one:
  `--source` against a flat folder, or no `--source` against a grouped one.
- **Only known media moves.**
  `jpg jpeg heic nef dng png tif mov mp4 m4v mpg mts avi wmv flv 3gp srt`.
  Everything else — including `.thm`, `.aae`, `.xmp` and Takeout `.json`
  sidecars — is reported and left where it is.
- **Every real move is recorded**, one fsync'd JSON line at a time, so an
  interrupted run still has a complete record of what it did.

# Manifest and undo

`--execute` writes `photo-archive_YYYYMMDD-HHmmss.manifest.jsonl` to the current
directory; `--log-dir` puts it somewhere else. Each line is
`{"at":…,"from":…,"to":…}` for one completed move. A dry run writes nothing.

```sh-session
$ photo-archive undo photo-archive_20260902-214500.manifest.jsonl --execute
```

`undo` reads the manifest backwards and moves every file back with the same
verified mover, dry run by default. It never overwrites: a file that is no
longer where the manifest says, or whose original path is occupied again, is
reported and left alone. Folders the ingest created stay behind, even when they
end up empty.

# Reject reasons

Everything left behind is grouped by reason in the closing summary. The source
file is untouched in every case.

| Reason                           | What it means                                                    |
| -------------------------------- | ---------------------------------------------------------------- |
| `not a known media type`         | The extension is not in the list above.                          |
| `no YYYY-MM-DD_HH-mm-ss_ prefix` | Run `exif-datify rename` first. Applies in `--event` mode too.   |
| `already at destination`         | A file of that name is already there. Contents are not compared. |
| `ambiguous RAW pairing`          | More than one twin candidate; the RAW was not bucketed or moved. |
| `failed to move`                 | The move itself errored. The detail carries the error.           |

`undo` has its own three: `not where the manifest says`,
`original path is occupied`, `failed to move back`.

# Exit codes

| Code | Meaning                                                             |
| ---- | ------------------------------------------------------------------- |
| 0    | The source was fully drained — nothing was left behind.             |
| 1    | Something was left behind. The summary says what and why.           |
| 2    | Pre-flight refused the run. No file was looked at, let alone moved. |

`undo` uses 0 and 1 the same way: 1 when anything could not be put back.
`lint`'s codes are in its own section below.

# Lint

```sh-session
$ photo-archive lint /Volumes/photos-archive
$ photo-archive lint /Volumes/photos-archive --only /Volumes/photos-archive/events/2022-09-08-Sicily --rule bucket-not-mirrored
```

`lint` checks the archive against the layout rules below and reports every place
it disagrees. **It never writes.** There is no `--fix` and there will not be
one: moving files is `ingest`'s job, because `ingest` writes a manifest that
`undo` can replay. `lint` opens folders and reads names, nothing more.

## What it walks

Three top-level folders — `events/`, `sorted/` and `relations/`. Every other
top-level entry is skipped and listed as an `info` line, so a typo'd folder is
still visible without anything being hardcoded. Each `relations/<person>/` is
walked with the same rules as the archive root: it holds its own `events/` and
`sorted/`.

Ignoring comes from the archive's own `fs-ignore` file at the root — that is
where `.DS_Store` and `@eaDir` live, not in the code. Dotfiles are skipped
everywhere. A `panorama` folder is listed but never descended into: its sets
nest one level deeper than anything else and carry no date prefix.

The walk materialises **one scope at a time** — one event's `footage/`, one
`sorted/YYYY/MM`, one person folder — judges it, and drops it before reading the
next. Peak memory is the largest single event, not the archive. The walk is
sequential, so a full run over SMB takes about a quarter of an hour (233,000
files in 819 scopes measured at 13 minutes); `--only` and `--rule` are what make
iterating bearable.

## Flags

| Flag                 | Meaning                                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `--only PATH`        | Judge only the scopes under `PATH`. Repeatable. Only the folders on the way to it are read.                                                  |
| `--rule ID`          | Run only this rule. Repeatable. An unknown id refuses the run.                                                                               |
| `--strict`           | Warnings fail the run too.                                                                                                                   |
| `--verbose`          | List every finding. The default is a sample of 10 per rule, plus a count of the rest.                                                        |
| `--format json`      | Print the whole run as one JSON object instead of the text report. Progress lines are suppressed, so stdout carries nothing but JSON.        |
| `--max-days-early N` | How many days before its event a media file may be dated before `media-before-event` fires. Default 1, which covers the evening-before shot. |

## Severities

- `error` — the structure is wrong. Fails the run.
- `warning` — style, or a backlog to work through. Fails the run only under
  `--strict`.
- `info` — something was skipped, reported so it stays visible. Never fails the
  run.

## Rules

IDs are stable: `--rule` names them, and the report groups by them. They are
listed in report order.

| ID                      | Rule                                                                     | Severity |
| ----------------------- | ------------------------------------------------------------------------ | -------- |
| `root-file`             | Visible file at the archive root (`fs-ignore` is reserved)               | error    |
| `root-unknown-folder`   | Top-level folder that is not `events`, `sorted` or `relations`           | info     |
| `person-folder-empty`   | Person folder with nothing in it                                         | error    |
| `person-folder-media`   | Media file directly in a person folder                                   | error    |
| `person-folder-unknown` | Person folder entry that is not `events` or `sorted`                     | info     |
| `event-name-format`     | Event name is not `YYYY-MM-DD-Name`                                      | error    |
| `event-name-date`       | Event date is not a real calendar date                                   | error    |
| `event-name-case`       | `Name` part is not PascalCase                                            | warning  |
| `event-unknown-entry`   | Entry in an event other than `footage`, `assets`, `exports`, `README.md` | error    |
| `event-footage-missing` | Event has no `footage/`                                                  | warning  |
| `media-before-event`    | Media dated more than `--max-days-early` before its event                | warning  |
| `footage-layout-mixed`  | `footage/` mixes loose media and source folders                          | error    |
| `source-folder-case`    | Source folder is not kebab-case                                          | warning  |
| `source-folder-nesting` | A folder inside a source folder (`panorama` exempt)                      | warning  |
| `missing-date-prefix`   | Media in `footage/` with no `YYYY-MM-DD_HH-mm-ss_` prefix                | warning  |
| `unrecognised-file`     | File in `footage/` of an unknown type                                    | warning  |
| `sidecar-file`          | `.thm` / `.xmp` / `.aae` clutter in `footage/`                           | warning  |
| `bucket-not-mirrored`   | RAW in `raw_versions/` not filed under its twin's folder                 | error    |
| `bucket-orphan-folder`  | `raw_versions/` sub-folder with no matching source folder                | error    |
| `bucket-non-raw`        | A non-RAW file inside `raw_versions/`                                    | error    |
| `raw-orphan`            | RAW in `raw_versions/` with no viewable twin anywhere in scope           | error    |
| `raw-loose-pair`        | RAW outside `raw_versions/` that has a viewable twin                     | warning  |
| `raw-ambiguous-pair`    | RAW with more than one pass-2 candidate                                  | warning  |
| `sorted-year-folder`    | `sorted/` entry that is not a four-digit year                            | error    |
| `sorted-month-folder`   | Year-folder entry that is not a month `01`–`12`                          | error    |
| `sorted-year-file`      | File directly in a year folder                                           | error    |
| `sorted-month-entry`    | Folder in a month other than `raw_versions`                              | error    |
| `sorted-bucket-nesting` | Sub-folder inside a `sorted` `raw_versions/`                             | error    |

The `bucket-*` and `raw-*` rules judge a `sorted/YYYY/MM` as well as an event's
`footage/`, with one exception: `bucket-orphan-folder` is events-only, because
`sorted/` has no source folders to mirror — a sub-folder in its bucket is
`sorted-bucket-nesting`, reported once. The `footage-*`, `source-folder-*`,
`missing-date-prefix`, `unrecognised-file` and `sidecar-file` rules judge an
event's `footage/` and nothing else.

Pairing uses the same two passes as `ingest` — exact stem, then trailing token
within 5 seconds — but looks anywhere in the scope's tree, not just in the
mirror folder. `bucket-not-mirrored`'s detail names the folder the RAW belongs
in.

## Output

The text report opens with the file and scope count and the wall time, then
lists findings by severity, then by rule in the order above, each rule with its
count and a sample of paths. Two runs over the same archive read the same.

`--format json` prints one object: `archiveRoot`, `files`, `scopes`,
`durationMs`, `strict`, `exitCode`, and `findings` — every finding, not a
sample, each as `{ruleId, severity, scope, path, detail?}`. `scope` is a label
such as `events/2022-09-08-Sicily` or `relations/aline/sorted/2015`; `path` is
absolute.

## Exit codes

| Code | Meaning                                                                                                                      |
| ---- | ---------------------------------------------------------------------------------------------------------------------------- |
| 0    | Clean, or warnings only without `--strict`.                                                                                  |
| 1    | At least one error — or one warning under `--strict`.                                                                        |
| 2    | Pre-flight refused: the root holds neither `events/` nor `sorted/`, `--rule` is unknown, or `--only` is outside the archive. |

# Development

```sh-session
$ pnpm --filter photo-archive test
$ pnpm --filter photo-archive typecheck
```

The pure core — name parsing, pairing, destination layout, validation, and every
lint rule over scope literals — is unit tested. `ingest` and `undo` are tested
end to end against a temporary archive, including the round trip that ingests a
tree and undoes it back to byte-identical. `lint` is tested end to end through
the real `bin/run.ts`, against a temporary archive seeded with one violation per
rule, asserting the JSON it prints.
