#!/usr/bin/env bash
set -eux

IMAGE_NAME="hwaterke/fs-indexer"
SHORT_COMMIT_REF=$(git rev-parse --short HEAD)
# The build context is the monorepo root; fs-indexer needs media-probe.
REPO_ROOT=$(git rev-parse --show-toplevel)

# Only Apple Silicon
docker buildx build --platform linux/arm64 -f "${REPO_ROOT}/packages/fs-indexer/Dockerfile" -t ${IMAGE_NAME}:latest -t ${IMAGE_NAME}:${SHORT_COMMIT_REF} --load "${REPO_ROOT}"

# All pltatforms
# docker buildx build --platform linux/amd64,linux/arm64 -f "${REPO_ROOT}/packages/fs-indexer/Dockerfile" -t ${IMAGE_NAME}:latest -t ${IMAGE_NAME}:${SHORT_COMMIT_REF} --load "${REPO_ROOT}"
