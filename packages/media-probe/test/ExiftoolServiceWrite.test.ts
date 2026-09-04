import {afterEach, beforeEach, describe, expect, test} from 'vitest'
import {cp, mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {ExiftoolService} from '../src/ExiftoolService.ts'
import {EXIF_TAGS} from '../src/types/ExiftoolMetadata.ts'

const WRITE_OPTIONS = {
  override: true,
  ignoreMinorErrors: true,
  dryRun: false,
}

// A name that a shell would mangle: `&` backgrounds, `$5` expands, spaces split.
const AWKWARD_PHOTO_NAME = 'Ben & Jerry $5.JPG'
const AWKWARD_VIDEO_NAME = "Ben & Jerry's $5 'best'.MOV"

describe('ExiftoolService writes', () => {
  const service = new ExiftoolService({})
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'media-probe-'))
  })

  afterEach(async () => {
    await rm(directory, {recursive: true, force: true})
  })

  const copyFixture = async (
    fixture: string,
    name: string
  ): Promise<string> => {
    const path = join(directory, name)
    await cp(`test/fixtures/${fixture}`, path)
    return path
  }

  test('setTimezoneOffsets round-trips on an awkward file name', async () => {
    const path = await copyFixture('nikon.jpg', AWKWARD_PHOTO_NAME)

    await service.setTimezoneOffsets(path, '+05:30', WRITE_OPTIONS)

    const metadata = await service.extractExifMetadata(path)
    expect(metadata[EXIF_TAGS.EXIF_OFFSET_TIME]).toBe('+05:30')
    expect(metadata[EXIF_TAGS.EXIF_OFFSET_TIME_ORIGINAL]).toBe('+05:30')
    expect(metadata[EXIF_TAGS.EXIF_OFFSET_TIME_DIGITIZED]).toBe('+05:30')
  })

  test('setAllTime round-trips on an awkward file name', async () => {
    const path = await copyFixture('nikon.jpg', AWKWARD_PHOTO_NAME)

    await service.setAllTime(path, '2022:06:06 17:00:00+02:00', {
      ...WRITE_OPTIONS,
      file: false,
    })

    const metadata = await service.extractExifMetadata(path)
    expect(metadata[EXIF_TAGS.DATE_TIME_ORIGINAL]).toBe('2022:06:06 17:00:00')
  })

  test('setQuickTimeCreationDate round-trips on an awkward file name', async () => {
    const path = await copyFixture('iphone-live-photo.mov', AWKWARD_VIDEO_NAME)

    await service.setQuickTimeCreationDate(
      path,
      '2022:06:06 17:00:00+02:00',
      WRITE_OPTIONS
    )

    const metadata = await service.extractExifMetadata(path)
    expect(metadata[EXIF_TAGS.QUICKTIME_CREATION_DATE]).toBe(
      '2022:06:06 17:00:00+02:00'
    )
  })

  test('setGpsCoordinates round-trips on an awkward file name', async () => {
    const path = await copyFixture('nikon.jpg', AWKWARD_PHOTO_NAME)

    await service.setGpsCoordinates(path, 50.8503, 4.3517, WRITE_OPTIONS)

    expect(await service.extractGpsExifMetadata(path)).toEqual({
      latitude: 50.8503,
      longitude: 4.3517,
    })
  })

  test('the logged command quotes an awkward file name', async () => {
    const commands: string[] = []
    const loggingService = new ExiftoolService({
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        command: (command) => commands.push(command),
      },
    })
    const path = await copyFixture('nikon.jpg', AWKWARD_PHOTO_NAME)

    await loggingService.setTimezoneOffsets(path, '+05:30', WRITE_OPTIONS)

    expect(commands).toHaveLength(1)
    expect(commands[0]).toContain(`'${path}'`)
  })
})
