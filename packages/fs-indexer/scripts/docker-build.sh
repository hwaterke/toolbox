#!/usr/bin/env bash
set -eux

IMAGE_NAME="hwaterke/fs-indexer"
SHORT_COMMIT_REF=$(git rev-parse --short HEAD)

# Only Apple Silicon
docker buildx build --platform linux/arm64 -t ${IMAGE_NAME}:latest -t ${IMAGE_NAME}:${SHORT_COMMIT_REF} --load .

# All pltatforms
# docker buildx build --platform linux/amd64,linux/arm64 -t ${IMAGE_NAME}:latest -t ${IMAGE_NAME}:${SHORT_COMMIT_REF} --load .