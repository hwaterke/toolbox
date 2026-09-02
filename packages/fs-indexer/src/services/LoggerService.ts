import * as winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import path from 'node:path'

class Logger {
  private logger: winston.Logger

  constructor(logger: winston.Logger) {
    this.logger = logger
  }

  debug(message: string, ...meta: unknown[]): void {
    this.logger.debug(message, meta)
  }

  info(message: string, ...meta: unknown[]): void {
    this.logger.info(message, meta)
  }

  warn(message: string, ...meta: unknown[]): void {
    this.logger.warn(message, meta)
  }

  error(message: string, ...meta: unknown[]): void {
    this.logger.error(message, meta)
  }

  command(command: string, isDryRun: boolean): void {
    this.logger.info(command, {isDryRun})
  }

  isDebug(): boolean {
    return this.logger.level === 'debug'
  }
}

export class LoggerService {
  private static logger: Logger | null = null

  public static configure({
    debug,
    logFolder,
  }: {
    logFolder?: string
    debug?: boolean
  }) {
    const transportArray: winston.transport[] = []

    if (logFolder) {
      transportArray.push(
        new DailyRotateFile({
          filename: path.join(logFolder, 'indexer-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          ),
        })
      )
    } else {
      transportArray.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp(),
            winston.format.printf(
              ({timestamp, level, message}) =>
                `${String(timestamp)} [${level}]: ${String(message)}`
            )
          ),
        })
      )
    }

    LoggerService.logger = new Logger(
      winston.createLogger({
        level: debug ? 'debug' : 'info',
        transports: transportArray,
      })
    )
  }

  public static getLogger(): Logger {
    if (!LoggerService.logger) {
      throw new Error('LoggerService is not configured.')
    }
    return LoggerService.logger
  }
}
