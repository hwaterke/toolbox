const numberFormatter = new Intl.NumberFormat('en-US')

export const formatNumber = (number: number): string =>
  numberFormatter.format(number)

export function formatBytes(bytes: number) {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const sizes = [
    'Bytes',
    'KiB',
    'MiB',
    'GiB',
    'TiB',
    'PiB',
    'EiB',
    'ZiB',
    'YiB',
  ]

  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${formatNumber(bytes / k ** i)} ${sizes[i]}`
}
