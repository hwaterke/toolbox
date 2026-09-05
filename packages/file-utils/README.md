# @hwaterke/file-utils

Filesystem traversal and file-move helpers for Node.

## Installation

Not published. Inside this monorepo, depend on it as a workspace package:

```jsonc
// packages/<pkg>/package.json
"dependencies": {"@hwaterke/file-utils": "workspace:*"}
```

## Usage

### `walkFiles`

Recursively walk a directory, invoking a callback per file. Supports filtering,
sorting, hidden-file inclusion, `.gitignore`-style ignore files, progress
reporting, and abort signals.

```ts
import {walkFiles, defaultProgressLogger} from '@hwaterke/file-utils'

await walkFiles({
  path: './photos',
  filter: (_path, dirent) =>
    dirent.isDirectory() || /\.(jpg|png)$/i.test(dirent.name),
  onFile: defaultProgressLogger(console.log),
  callback: async (filePath) => {
    // process file
  },
})
```

Pair `sort` with one of the included comparators:

```ts
import {walkFiles, compareAsc, videosLastComparator} from '@hwaterke/file-utils'

// Buffer the full tree and sort globally
await walkFiles({path: './media', sort: compareAsc, callback})

// Sort each folder as it's traversed (streaming)
await walkFiles({
  path: './media',
  sort: videosLastComparator,
  sortPerFolder: true,
  callback,
})
```

### `moveFileIntoFolder`

Move a file into a target folder, creating the folder if needed. Cross-device
moves fall back to a copy + sha256 verification + unlink.

```ts
import {moveFileIntoFolder} from '@hwaterke/file-utils'

const result = await moveFileIntoFolder('./inbox/photo.jpg', './archive/2026', {
  ifExists: 'suffix', // or 'skip'
})

if (result.moved) {
  console.log(`moved → ${result.destinationPath}`)
} else {
  console.log(`skipped (${result.reason})`)
}
```

### Helpers

- `compareAsc(a, b)` / `compareDesc(a, b)` — string comparators for the `sort`
  option.
- `videosLastComparator(a, b)` — sorts `.mp4` / `.mov` after other files.
- `defaultProgressLogger(log)` — builds an `onFile` handler that prints
  `index/total - path`.

## Development

```sh
npm install
npm run test       # vitest
npm run typecheck  # tsc --noEmit
npm run lint       # oxlint
npm run format     # prettier --write .
```

## Publishing a new version

Releases are automated: pushing to `master` runs the `Publish` GitHub Action,
which executes `npx jsr publish`.

1. Bump the `version` field in **both** [`jsr.json`](./jsr.json) and
   [`package.json`](./package.json). JSR reads `jsr.json`, but the two are kept
   in sync to avoid confusion.
2. Commit the bump (e.g. `git commit -am "Release vX.Y.Z"`).
3. Push to `master`. The workflow at
   [`.github/workflows/publish.yml`](./.github/workflows/publish.yml) will
   publish to JSR.

JSR rejects republishing an existing version, so the version bump is mandatory.

## License

MIT
