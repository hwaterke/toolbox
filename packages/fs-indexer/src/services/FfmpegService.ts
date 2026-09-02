import {promisify} from 'node:util'
import {exec as callbackExec} from 'node:child_process'
import {existsSync, readFileSync} from 'node:fs'
import {LoggerService} from './LoggerService.js'

const exec = promisify(callbackExec)

export class FfmpegService {
  private readonly logger = LoggerService.getLogger()

  async extractGpsCoordinatesFromSubtitles(path: string): Promise<{
    latitude: number
    longitude: number
  } | null> {
    const ffprobeStdout = await this.rawFfprobe(
      `-i "${path}" -select_streams s -show_entries stream=index:stream_tags=language -v quiet -of compact=p=0:nk=1`
    )

    if (ffprobeStdout === '') {
      return null
    }

    const subtitleStreamIndices = ffprobeStdout.trim().split('\n')

    for (const subtitleStream of subtitleStreamIndices) {
      const subtitleStreamIndex = subtitleStream.split('|')[0]

      const ffmpegStdout = await this.rawFfmpeg(
        `-i "${path}" -map 0:${subtitleStreamIndex} -c:s webvtt -f webvtt -`
      )

      const subtitle = ffmpegStdout.trim().split('\n')
      const gpsPattern = /GPS \((\d+\.\d+), (\d+\.\d+), \d+\)/

      for (const line of subtitle) {
        const match = line.match(gpsPattern)
        if (match) {
          const latitude = Number.parseFloat(match[1])
          const longitude = Number.parseFloat(match[2])
          return {
            latitude,
            longitude,
          }
        }
      }
    }

    return null
  }

  async extractGpsCoordinatesFromSubtitleFile(path: string): Promise<{
    latitude: number
    longitude: number
  } | null> {
    let subtitleFilePath = path.replace(/\.\w+$/, '.srt')
    if (!existsSync(subtitleFilePath)) {
      subtitleFilePath = path.replace(/\.\w+$/, '.SRT')
    }
    if (!existsSync(subtitleFilePath)) {
      return null
    }

    const srtContent = readFileSync(subtitleFilePath, 'utf8')
    const srtLines = srtContent.split('\n')
    const gpsPattern = /\[latitude: (\d+\.\d+)] \[longitude: (\d+\.\d+)]/

    //  [latitude: 50.64788] [longitude: 4.28388]
    for (const line of srtLines) {
      const match = line.match(gpsPattern)
      if (match) {
        const latitude = Number.parseFloat(match[1])
        const longitude = Number.parseFloat(match[2])
        return {
          latitude,
          longitude,
        }
      }
    }

    return null
  }

  private async rawFfprobe(command: string) {
    const fullCommand = `ffprobe ${command}`

    this.logger.debug(fullCommand)

    const {stdout} = await exec(fullCommand)
    return stdout
  }

  private async rawFfmpeg(command: string) {
    const fullCommand = `ffmpeg ${command}`

    this.logger.debug(fullCommand)

    const {stdout} = await exec(fullCommand)
    return stdout
  }
}
