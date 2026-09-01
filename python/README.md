# RAW hashing helper (rawpy)

This folder contains the Python helper used by the `RAWPY_RAW_VISIBLE_SHA256` hashing algorithm.

## Setup (mise + uv)

- Install the toolchain:

```bash
mise install
```

- Create/sync the python environment:

```bash
uv sync --project python
```

`uv run --project python ...` will also auto-resolve dependencies if needed.

## Manual run

```bash
uv run --project python python python/raw_visible_hash.py --path "/path/to/file.nef"
```

Version string:

```bash
uv run --project python python python/raw_visible_hash.py --version
```

