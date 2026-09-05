# toolbox

A monorepo of Node + TypeScript command line tools and the small libraries they
share.

## Packages

Three CLIs, under `packages/`:

| Package                                   | What it does                                                                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`exif-datify`](packages/exif-datify)     | Renames media files from their Exif metadata, and repairs dates that cameras got wrong. Commands: `rename`, `set-date`, `dji-shift`, `gopro`, `nikon`, `rotate`, `strip`, `group-by-model`, `find-low-resolution`. |
| [`fs-indexer`](packages/fs-indexer)       | Indexes a filesystem into a SQLite database — sizes, hashes, Exif — so duplicates can be found without re-reading the files. Commands: `crawl`, `hash`, `exif`, `sync`, `verify`, `info`, `lookup`.                |
| [`photo-archive`](packages/photo-archive) | Files already-renamed media into the photo archive, and checks the archive against its layout rules. Commands: `ingest`, `lint`, `undo`.                                                                           |

Two libraries they depend on:

| Package                                         | What it does                                      |
| ----------------------------------------------- | ------------------------------------------------- |
| [`@hwaterke/file-utils`](packages/file-utils)   | Filesystem traversal and file-move helpers.       |
| [`@hwaterke/media-probe`](packages/media-probe) | Reads metadata out of media files via `exiftool`. |

## No build step

There is no `dist`, no `tsc -b`, no bundler. Node 24 strips TypeScript types
natively, so every CLI runs straight from its `.ts` source. `tsc --noEmit`
survives as the typechecker only.

Two rules keep it that way, and both are enforced by the shared
`tsconfig.base.json`:

- **`erasableSyntaxOnly`** rejects any syntax Node cannot strip — `enum`,
  constructor parameter properties. Without it those compile fine and then fail
  at runtime.
- **Relative imports end in `.ts`**, not `.js`, alongside
  `allowImportingTsExtensions`. Node rewrites no specifiers.

Workspace dependencies resolve because pnpm links them as symlinks and Node
follows the real path, which lands outside `node_modules`. Anything that turns a
workspace dependency into a real directory — `pnpm deploy`, `npm pack`, copying
`node_modules` into a container — breaks this. Use
`pnpm install --filter <pkg>...` and keep the workspace layout.

## Requirements

- Node 24 — pinned in `mise.toml`
- pnpm — pinned by the root `packageManager` field and installed by corepack,
  which `mise` enables in a post-install hook
- `exiftool`, for `exif-datify`, `media-probe` and `fs-indexer exif`
- Python 3.12 and `uv`, for the `fs-indexer` raw-hash helper in
  `packages/fs-indexer/python`

## Setup

```sh
mise install
pnpm install
```

## Putting the CLIs on PATH

Symlink each CLI's entry point into a directory already on your PATH. The
symlink is the whole distribution mechanism — nothing is published.

```sh
ln -s "$PWD/packages/exif-datify/bin/run.ts"   ~/.local/bin/exif-datify
ln -s "$PWD/packages/fs-indexer/bin/run.ts"    ~/.local/bin/fs-indexer
ln -s "$PWD/packages/photo-archive/bin/run.ts" ~/.local/bin/photo-archive
```

oclif resolves its commands through the symlink, so the CLIs work from any
directory.

## Development

Run from the repository root:

```sh
pnpm run typecheck   # tsc --noEmit across every package
pnpm run lint        # oxlint, with type-aware rules
pnpm run test        # vitest across every package
pnpm run format      # prettier
```

Renovate raises grouped dependency updates weekly. Nothing auto-merges.

## Publishing

Nothing here is published. `exif-datify` and `fs-indexer` were once on npm and
`@hwaterke/file-utils` and `@hwaterke/media-probe` on JSR; all four are
deprecated or archived and point back here. The four original repositories are
archived on GitHub — their history lives in this repository, imported in full.

## License

MIT. See [LICENSE](LICENSE).
