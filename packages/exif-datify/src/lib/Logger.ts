import chalk from 'chalk'

export const Logger = {
  debug(message: string, ...meta: unknown[]) {
    // console.debug(message, ...meta)
  },
  info(message: string, ...meta: unknown[]) {
    console.info(message, ...meta)
  },
  warn(message: string, ...meta: unknown[]) {
    console.warn(chalk.yellow(message), ...meta)
  },
  error(message: string, ...meta: unknown[]) {
    console.error(chalk.red(message), ...meta)
  },
  command(command: string, isDryRun: boolean) {
    console.log(
      `${chalk.grey(`    ${command}`)}${isDryRun ? chalk.yellow('(DRY RUN)') : ''}`
    )
  },
}
