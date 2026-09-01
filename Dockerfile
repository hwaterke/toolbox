FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN apk add --no-cache alpine-sdk python3
RUN npm install
COPY src ./src
COPY bin ./bin
COPY tsconfig.json ./
RUN npm run build

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

FROM node:24-alpine
WORKDIR /app
ENV EXIFTOOL_VERSION=13.52
RUN apk add --no-cache \
    perl \
    make \
    xxhash \
    b3sum \
    tiff \
    libheif \
    imagemagick
# Install ExifTool from source
RUN wget https://exiftool.org/Image-ExifTool-${EXIFTOOL_VERSION}.tar.gz && \
    tar -xzf Image-ExifTool-${EXIFTOOL_VERSION}.tar.gz && \
    rm Image-ExifTool-${EXIFTOOL_VERSION}.tar.gz && \
    cd Image-ExifTool-${EXIFTOOL_VERSION} && \
    perl Makefile.PL && \
    make install && \
    cd .. && \
    rm -rf Image-ExifTool-${EXIFTOOL_VERSION}
# Install Node dependencies
COPY package.json package-lock.json ./
RUN apk add --no-cache --virtual .build-deps alpine-sdk python3 && \
    npm install --production && \
    apk del .build-deps
# Copy build files and binaries
COPY --from=builder /app/dist ./dist/
COPY --from=builder /app/bin ./bin/
COPY --from=ffmpeg-downloader /usr/local/bin/ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg-downloader /usr/local/bin/ffprobe /usr/local/bin/ffprobe

ENTRYPOINT [ "/app/bin/run.js" ]