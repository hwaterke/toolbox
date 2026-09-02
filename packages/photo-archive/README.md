# photo-archive

CLI to file already-renamed media into the photo archive.

It takes a folder of media whose names already carry a `YYYY-MM-DD_HH-mm-ss_`
prefix — written earlier by [`exif-datify rename`](../exif-datify) — and moves
each file to the right place in the archive. It never reads Exif: the date comes
from the filename alone.

# Installation

Not published. The CLI is a chezmoi-managed symlink into this checkout:

```sh-session
$ ls -l ~/.local/bin/photo-archive
photo-archive -> ~/Developer/toolbox/packages/photo-archive/bin/run.ts
```

Node 24 runs the TypeScript directly, so there is no build step. The chezmoi
source is `dot_local/bin/symlink_photo-archive.tmpl`.

# Usage

```sh-session
$ photo-archive ingest <source> <archive-root> [--event NAME] [--source NAME] [--execute]
$ photo-archive undo <manifest.jsonl> [--execute]
```

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
passes run, both ported from the original `photo-tools.ts`:

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
- **Only known media moves.** `jpg jpeg heic png mov mp4 nef dng srt`.
  Everything else — including `.aae`, `.xmp` and Takeout `.json` sidecars — is
  reported and left where it is.
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

# Development

```sh-session
$ pnpm --filter photo-archive test
$ pnpm --filter photo-archive typecheck
```

The pure core — name parsing, pairing, destination layout, validation — is unit
tested; `ingest` and `undo` are tested end to end against a temporary archive,
including the round trip that ingests a tree and undoes it back to
byte-identical.
