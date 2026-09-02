import {describe, expect, test, vi} from 'vitest'
import {defaultProgressLogger} from '../src/walkFiles.ts'

describe('defaultProgressLogger', () => {
  test('logs index/total when total is defined', () => {
    const log = vi.fn<(message: string) => void>()
    const onFile = defaultProgressLogger(log)

    onFile('/tmp/a.txt', {index: 3, total: 10})

    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('3/10 - /tmp/a.txt')
  })

  test('logs index alone when total is undefined', () => {
    const log = vi.fn<(message: string) => void>()
    const onFile = defaultProgressLogger(log)

    onFile('/tmp/a.txt', {index: 7, total: undefined})

    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('7 - /tmp/a.txt')
  })

  test('routes every call to the injected log function', () => {
    const log = vi.fn<(message: string) => void>()
    const onFile = defaultProgressLogger(log)

    onFile('/a', {index: 1, total: 2})
    onFile('/b', {index: 2, total: 2})

    expect(log).toHaveBeenNthCalledWith(1, '1/2 - /a')
    expect(log).toHaveBeenNthCalledWith(2, '2/2 - /b')
  })
})
