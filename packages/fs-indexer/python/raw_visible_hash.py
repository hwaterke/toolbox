from __future__ import annotations

import argparse
import hashlib
import platform
import sys

import numpy as np
import rawpy


def _sha256_raw_visible(path: str) -> str:
    with rawpy.imread(path) as raw:
        # We use raw_image_visible to get the sensor data excluding masked pixels
        arr = raw.raw_image_visible

        # Ensure we are dealing with a standard memory layout
        # ascontiguousarray is crucial for consistent hashing
        if not arr.flags.c_contiguous:
            arr = np.ascontiguousarray(arr)

        # Normalize byte order to system native to ensure consistency
        if arr.dtype.byteorder not in ("=", "|"):
            arr = arr.astype(arr.dtype.newbyteorder("="), copy=False)

        h = hashlib.sha256()

        # Hash the metadata of the array itself
        h.update(arr.dtype.str.encode("ascii"))
        h.update(b"|")
        h.update(("x".join(map(str, arr.shape))).encode("ascii"))
        h.update(b"|")
        h.update(arr.tobytes())
        return h.hexdigest()


def _version_string() -> str:
    return (
        f"python={platform.python_version()} "
        f"rawpy={getattr(rawpy, '__version__', 'unknown')}"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="raw_visible_hash.py",
        description="Compute sha256 of rawpy raw_image_visible.",
    )
    parser.add_argument("--path", help="Path to RAW file (.nef/.dng).")
    parser.add_argument(
        "--version",
        action="store_true",
        help="Print tool version string and exit.",
    )
    args = parser.parse_args(argv)

    if args.version:
        print(_version_string())
        return 0

    if not args.path:
        parser.error("--path is required unless --version is used")

    print(_sha256_raw_visible(args.path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
