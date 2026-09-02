FROM --platform=$BUILDPLATFORM alpine AS ffmpeg-downloader
WORKDIR /ffmpeg
ARG TARGETARCH
RUN apk add --no-cache wget
# Download the appropriate ffmpeg static binary depending on the architecture
RUN if [ "$TARGETARCH" = "amd64" ]; then \
        wget https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -O ffmpeg.tar.xz; \
    elif [ "$TARGETARCH" = "arm64" ]; then \
        wget https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz -O ffmpeg.tar.xz; \
    fi && \
    tar -xvf ffmpeg.tar.xz && \
    mv ffmpeg-*/ffmpeg /usr/local/bin/ffmpeg && \
    mv ffmpeg-*/ffprobe /usr/local/bin/ffprobe

# Debian, not Alpine: rawpy publishes no musl wheel, so the RAW hashing helper
# cannot be installed on Alpine at all.
FROM node:24-trixie-slim
WORKDIR /app
ENV EXIFTOOL_VERSION=13.59
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        wget \
        perl \
        make \
        imagemagick \
        xxhash \
        b3sum && \
    rm -rf /var/lib/apt/lists/*
# Install ExifTool from source. The tarball comes from the git tag, not from
# exiftool.org, which serves the current release only and 404s on every pin.
RUN wget https://github.com/exiftool/exiftool/archive/refs/tags/${EXIFTOOL_VERSION}.tar.gz -O exiftool.tar.gz && \
    tar -xzf exiftool.tar.gz && \
    rm exiftool.tar.gz && \
    cd exiftool-${EXIFTOOL_VERSION} && \
    perl Makefile.PL && \
    make install && \
    cd .. && \
    rm -rf exiftool-${EXIFTOOL_VERSION}
# uv, for the rawpy RAW hashing helper. Pinned by digest-free tag on the
# official image so the version is visible here rather than fetched by script.
COPY --from=ghcr.io/astral-sh/uv:0.12.9 /uv /usr/local/bin/uv
# The interpreter lives outside HOME so its location does not depend on the
# user the container runs as.
ENV UV_PYTHON_INSTALL_DIR=/opt/uv/python \
    UV_LINK_MODE=copy \
    UV_FROZEN=1
# The environment is built here, so a run needs no network and no lock change.
COPY packages/fs-indexer/python ./packages/fs-indexer/python/
RUN uv sync --project ./packages/fs-indexer/python
# pnpm, at the version pinned by the root packageManager field
RUN corepack enable pnpm
# Workspace metadata only, so a source change does not reinstall dependencies.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/media-probe/package.json ./packages/media-probe/
COPY packages/fs-indexer/package.json ./packages/fs-indexer/
# The workspace layout is kept as pnpm creates it. Never `pnpm deploy`: it
# copies workspace dependencies in as real directories, and node refuses to
# strip types under node_modules.
RUN pnpm install --frozen-lockfile --filter fs-indexer... --prod
# Sources run as-is; node strips the types.
COPY packages/media-probe/src ./packages/media-probe/src/
COPY packages/fs-indexer/src ./packages/fs-indexer/src/
COPY packages/fs-indexer/bin ./packages/fs-indexer/bin/
COPY --from=ffmpeg-downloader /usr/local/bin/ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg-downloader /usr/local/bin/ffprobe /usr/local/bin/ffprobe

ENTRYPOINT [ "node", "/app/packages/fs-indexer/bin/run.ts" ]
