import chalk from 'chalk'

/**
 * Application-wide logger
 */
export class Logger {
  static LEVELS = {
    trace:    4,
    debug:    3,
    info:     2,
    warn:     1,
    error:    0,
  }

  static LEVEL_COLORS = {
    trace:    chalk.dim.gray,
    debug:    chalk.dim.gray,
    info:     chalk.reset,
    warn:     chalk.yellow,
    error:    chalk.red,
  }

  static CONTENT_COLORS = {
    trace:    chalk.dim.gray,
    debug:    chalk.dim.gray,
    info:     chalk.reset,
    warn:     chalk.reset,
    error:    chalk.reset,
  }

  #level

  constructor(level = 'info') {
    if (Logger.LEVELS[level] === undefined) {
      print('WARN: Given loglevel', level, 'is invalid. Reverting to "info"')
    }
    this.#level = Logger.LEVELS[level] || 'info'
  }

  #log(level, ...args) {
    if (this.#level >= Logger.LEVELS[level]) {
      args = args.length > 1 ? Logger.CONTENT_COLORS[level](...args) : Logger.CONTENT_COLORS[level](args)
      const parts = [
        chalk.bold(new Date().toISOString()),
        chalk.cyan('[') + Logger.LEVEL_COLORS[level](level.padEnd(5)) + chalk.cyan(']'),
        args
      ]
      printalws(...parts)
    }
  }

  trace(...args) {
    this.#log('trace', ...args)
  }

  debug(...args) {
    this.#log('debug', ...args)
  }

  info(...args) {
    this.#log('info', ...args)
  }

  warn(...args) {
    this.#log('warn', ...args)
  }

  error(...args) {
    this.#log('error', ...args)
  }
}

export const printalws = console.log.bind(console)
