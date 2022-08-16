#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { dirname, extname, normalize } from 'node:path'
import { createReadStream, createWriteStream, existsSync as exists } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import https from 'node:https'
import { createServer } from 'http'
import zlib from 'node:zlib'
import tar from 'tar-stream'
import mime from 'mime'
import minimist from 'minimist'
import { Writable } from 'node:stream'
import pkg from './package.json' assert { type: 'json' }
import semver from 'semver'
import { IncomingMessage, ServerResponse } from 'node:http'
import chalk from 'chalk'

const args = minimist(process.argv.slice(2), {
  boolean: [ 'quiet', 'cors', 'help' ],
  alias: {
    'help': 'h',
    'quiet': 'q',
    'cors': 'C',
    'port': 'p',
    'storage': 's',
    'registry': 'r',
    'loglevel': 'L',
    'maxage': [ 'max-age', 'M' ],
    'npmUpdateInterval': [ 'npm-update-interval', 'U' ],
  },
  default: {
    help: false,
    quiet: false,
    port: 2998,
    storage: './packages',
    registry: 'https://registry.npmjs.org',
    prefix: '/package/',
    loglevel: 'info',
    maxage: 30,
    cors: false,
    npmUpdateInterval: 1,
  },
  unknown(name) {
    if (name.startsWith('-')) {
      console.error('error: unknown parameter:', name)
      process.exit(1)
    }
  }
})

args.documentRoot = args._[0] || '.'
if (!args.prefix.startsWith('/')) args.prefix = '/' + args.prefix
if (!args.prefix.endsWith('/')) args.prefix = args.prefix + '/'

const print = args.quiet ? () => {} : console.log.bind(console)
const printalws = console.log.bind(console)

if (args.h || args.help) {
  printalws(`@padcom/npm-serve by ${pkg.author}`)
  printalws(`usage:`)
  printalws(`  ${pkg.name} [options] document-root\n`)
  printalws(`options:`)
  printalws(`  -V, --version                              # show program version and exit`)
  printalws(`  -h, --help                                 # show help and exit`)
  printalws(`  -q, --quiet                                # suppress program banner`)
  printalws(`  -p, --port=2998                            # port to listen to for requests`)
  printalws(`  -s, --storage=packages                     # location to store packages`)
  printalws(`  -r, --registry=https://registry.npmjs.org  # upstream npm registry`)
  printalws(`  -P, --prefix=/package/                     # prefix for serving packages`)
  printalws(`  -L, --log-level=info                       # log level (trace, debug, info, warn, error)`)
  printalws(`  -C, --cors                                 # enable sending CORS headers`)
  printalws(`  -M, --max-age=30                           # max-age header to send to the browser`)
  printalws(`  -U, --npm-update-interval=1                # update interval for querying upstream npm registry`)

  process.exit(0)
}

if (args.V || args.version) {
  printalws(pkg.version)
  process.exit(0)
}

class Logger {
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
    if (!Logger.LEVELS[level]) {
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

const logger = new Logger(args.loglevel)

class LocationParser {
  /**
   * Example: @padcom/mf-test-library6@0.0.1/dist/index.js
   */
  parse(spec) {
    const parts = spec.split('/').filter(x => x)
    const isScoped = parts[0].startsWith('@')

    const scope = isScoped ? parts[0] : ''
    const [ name, version ] = (isScoped ? parts[1] : parts[0]).split('@')
    const path = (isScoped ? parts.slice(2) : parts.slice(1)).join('/')

    return { scope, name, version, path }
  }
}

class MetadataProvider {
  constructor({ storage = './packages' } = {}) {
    this.storage = storage
  }

  /**
   * Retrieve package metadata
   *
   * @param {String} name package name
   * @param {String} scope package scope (optional)
   */
  async fetch(name, scope = '') {
    throw new Error('Not implemented')
  }

  getPacketVersion(metadata, requested = 'latest') {
    const tags = Object.keys(metadata['dist-tags'])
    if (tags.includes(requested)) {
      return metadata['dist-tags'][requested]
    } else {
      const versions = Object.keys(metadata.versions)
      return semver.maxSatisfying(versions, `^${requested}`)
    }
  }

  getDefaultPacketExport(metadata, version) {
    return metadata.versions[version]?.main
  }

  getPacketFilename(name, version, scope = '') {
    if (scope) {
      return `${scope}/${name}-${version}`
    } else {
      return `${name}-${version}`
    }
  }

  getArchiveFilename(name, version, scope = '') {
    return `${this.storage}/${this.getPacketFilename(name, version, scope)}.tgz`
  }

  getArchiveLocation(name, version, scope = '') {
    if (scope) {
      return `${args.registry}/${scope}/${name}/-/${name}-${version}.tgz`
    } else {
      return `${args.registry}/${name}/-/${name}-${version}.tgz`
    }
  }

  getMetadataFilename(name, scope = '') {
    if (scope) {
      return `${this.storage}/${scope}/${name}.json`
    } else {
      return `${this.storage}/${name}.json`
    }
  }

  /**
   * Parse metadata and extract version
   *
   * @param {Object} metadata package metadata
   */
  parse(packet, metadata) {
    if (!metadata || metadata.error) {
      throw { code: 404, error: metadata.error }
    }

    const { version: requestedVersion, path: requestedPath } = new LocationParser().parse(packet)
    const version = this.getPacketVersion(metadata, requestedVersion)
    const defaultExport = this.getDefaultPacketExport(metadata, version)
    if (!requestedPath && !defaultExport) {
      throw { code: 422, error: 'package.json/main field is empty!' }
    }
    const path = normalize(requestedPath || defaultExport)

    return { version, metadata, path }
  }
}

const PACKAGE_CACHE = {}

class CacheMetadataProvider extends MetadataProvider {
  getCacheKey(name, scope = '') {
    return `${scope ? scope + '/' : ''}${name}`
  }

  async fetch(name, scope = '') {
    return PACKAGE_CACHE[this.getCacheKey(name, scope)].metadata
  }

  async update(name, scope, metadata, location, path) {
    await this.#writeJsonFile(this.getMetadataFilename(name, scope), metadata)

    const CACHE_KEY = this.getCacheKey(name, scope)

    PACKAGE_CACHE[CACHE_KEY] = {
      scope, name, metadata, location, path, timestamp: Date.now(),
      get isOutdated() {
        return Date.now() - this.timestamp > args.npmUpdateInterval * 1000
      }
    }

    return { path, metadata, location }
  }

  async #writeJsonFile(filename, obj) {
    if (!exists(dirname(filename))) await mkdir(dirname(filename), { recursive: true })
    await writeFile(filename, JSON.stringify(obj, null, 2))
  }
}

class NPMMetadataProvider extends MetadataProvider {
  async fetch(name, scope = '') {
    const metadataUrl = `http://registry.npmjs.org/${scope}/${name}`
    return await fetch(metadataUrl).then(response => response.json())
  }

  async update(cache, packet, name, scope = '') {
    const metadata = await this.fetch(name, scope)
    const { version, path } = this.parse(packet, metadata)
    const location = this.getArchiveFilename(name, version, scope)
    await cache.update(name, scope, metadata, location, path)

    return { version, path, metadata, location }
  }
}

class StorageMetadataProvider extends MetadataProvider {
  async fetch(name, scope = '') {
    const filename = this.getMetadataFilename(name, scope)
    return JSON.parse(await readFile(filename))
  }

  async update(cache, packet, name, scope = '') {
    const metadata = await this.fetch(name, scope)
    const { version, path } = this.parse(packet, metadata)
    const location = this.getArchiveFilename(name, version, scope)
    await cache.update(name, scope, metadata, location, path)

    return { version, path, metadata, location }
  }
}

/**
 * Download packet metadata and calculate other packet info.
 *
 * @param {String} packet packet name (including scope, packet name and optionally version)
 */
async function getPacketInfo(packet, { storage = './packages' } = {}) {
  // TODO: this function is very complex, needs to be split into smaller pieces
  const { scope, name, path: requestedPath, version: requestedVersion } = new LocationParser().parse(packet)
  const cache = new CacheMetadataProvider({ storage })
  const npm = new NPMMetadataProvider({ storage })
  const file = new StorageMetadataProvider({ storage })

  const CACHE_KEY = cache.getCacheKey(name, scope)
  let actualVersion = ''
  let actualPath = ''

  if (!PACKAGE_CACHE[CACHE_KEY]) {
    const filename = file.getMetadataFilename(name, scope)
    if (exists(filename)) {
      const { version, path } = await file.update(cache, packet, name, scope)
      actualVersion = version
      actualPath = path
    } else {
      const { version, path } = await npm.update(cache, packet, name, scope)
      actualVersion = version
      actualPath = path
    }
  } else {
    const metadata = await cache.fetch(name, scope)
    const { version, path } = cache.parse(packet, metadata)
    actualVersion = version
    actualPath = path
    if (!PACKAGE_CACHE[CACHE_KEY].busy && PACKAGE_CACHE[CACHE_KEY].isOutdated) {
      scheduleCacheRefresh(name, scope)
    }
  }

  const isDefaultRequest = requestedVersion !== actualVersion || requestedPath !== actualPath
  const contentType = !isDefaultRequest ? mime.getType(extname(requestedPath)) : null

  const pkg = PACKAGE_CACHE[CACHE_KEY]

  return {
    ...pkg,
    isDefaultRequest,
    contentType,
    version: actualVersion,
    location: npm.getArchiveLocation(name, actualVersion, scope),
    filename: file.getArchiveFilename(name, actualVersion, scope),
    path: actualPath,
  }

  function scheduleCacheRefresh(name, scope = '') {
    logger.info('Scheduling refresh of', scope, name)
    PACKAGE_CACHE[CACHE_KEY].busy = true
    setImmediate(async () => {
      try {
        const { metadata } = await npm.update(cache, packet, name, scope)
        logger.info('Cache updated successfully for', metadata.name)
      } catch (e) {
        logger.warn('unable to refresh package', CACHE_KEY, ':', e)
      }
    })
  }
}

/**
 * Download a file from location (url) to file (local)
 *
 * @param {String} location url where to get the file from
 * @param {String} file path to the file on disk
 * @returns {Promise<void>} an empty promise when the file has been retrieved
 */
async function download(location, file) {
  logger.debug('Downloading file', location, 'to', file)
  return new Promise((resolve, reject) => {
    https.get(location, async (res) => {
      if (res.statusCode !== 200) {
        reject({ code: 404, error: 'Not found' })
      } else {
        logger.trace('Writing file', file)
        const folder = dirname(file)
        if (!exists(folder)) await mkdir(folder, { recursive: true })
        res.on('end', () => {
          logger.debug('File', location, 'downloaded to', file)
          resolve()
        })
        res.on('error', reject)
        res.pipe(createWriteStream(file))
      }
    })
  })
}

/**
 * This function opens up the given `file` archige (.tgz), iterates
 * over the files inside it and if it finds the `package/${path}`
 * then it is streamed to `target`
 *
 * @param {String} archive filename of the archive
 * @param {String} path filename to extract from the archive
 * @param {Writable} output writable stream to write the content of the file to
 * @returns {Promise<void>} an empty promise when the content has been streamed to output
 */
function streamArchiveFile(archive, path, output) {
  return new Promise((resolve, reject) => {
    const normalized = normalize(`package/${path}`)

    const extract = tar.extract()
    extract.on('error', reject)
    extract.on('entry', (header, stream, next) => {
      if (header.name === normalized) {
        logger.trace('File', normalized, 'found - streaming')
        stream.pipe(output)
      }
      stream.on('end', () => {
        if (header.name === normalized) {
          logger.trace('File', normalized, 'has been transferred successfully')
          extract.end()
          resolve()
        } else {
          logger.trace('Skipping', header.name)
          next()
        }
      })
      stream.on('error', reject)
      stream.resume()
    })
    extract.on('finish', () => {
      reject({ code: 404, error: 'Not found (in archive)' })
    })

    const gunzip = zlib.createGunzip()
    gunzip.on('error', reject)

    const source = createReadStream(archive)
    source.on('error', reject)

    logger.info(`HTTP/1.1 GET - ${archive}/${normalized}`)
    source.pipe(gunzip).pipe(extract)
  })
}

async function getETagFor(file) {
  const stats = await stat(file)
  return createHash('sha1').update(stats.mtime.toISOString()).digest('hex')
}

async function servePacket(packet, req, res) {
  try {
    const { scope, name, location, version, path, filename, contentType, isDefaultRequest } = await getPacketInfo(packet, { storage: args.storage })
    if (isDefaultRequest) {
      res.statusCode = 302
      res.setHeader('access-control-allow-origin', '*')
      res.setHeader('location', `${args.prefix}${scope}/${name}@${version}/${path}`)
    } else {
      if (!exists(filename)) {
        await download(location, filename)
      } else {
        logger.debug('File', filename, 'already exists - not downloading')
      }
      res.setHeader('Content-Type', contentType)
      if (args.cors) res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Cache-Control', `max-age=${args.maxage}`)
      if (getETagFor(filename) === req.headers['if-none-match']) {
        res.statusCode = 304
      } else {
        res.setHeader('etag', await getETagFor(filename))
        await streamArchiveFile(filename, path, res)
      }
    }
  } catch (e) {
    if (e.code && e.error) {
      logger.error(e.error)
      res.statusCode = e.code
      res.statusMessage = e.error
    } else {
      logger.error(e)
      res.statusCode = 500
      res.statusMessage = 'Unknown error + "' + e + '"'
    }
  }
}

/**
 * Serve a static file with substitutions
 *
 * @param {IncomingMessage} req request
 * @param {ServerResponse} res response
 */
async function serveFile(req, res) {
  const location = new URL('http://localhost/' + req.url)
  const path = location.pathname.split('/').slice(2).join('/') || 'index.html'

  const contentType = mime.getType(path)
  res.setHeader('Content-Type', contentType)

  const filename = normalize(`${args.documentRoot}/${path}`)
  if (exists(filename)) {
    logger.info('HTTP/1.1 GET -', filename)
    res.setHeader('Cache-Control', `max-age=${args.maxage}`)
    if (args.cors) res.setHeader('Access-Control-Allow-Origin', '*')
    if (getETagFor(filename) === req.headers['if-none-match']) {
      res.statusCode = 304
    } else {
      res.setHeader('etag', await getETagFor(filename))
      let content = (await readFile(filename)).toString()
      res.write(content)
    }
  } else {
    logger.warn('HTTP/1.1 GET -', filename, 'not found')
  }
}

const server = createServer(async (req, res) => {
  if (!['GET', 'OPTIONS'].includes(req.method)) {
    res.statusCode = 404
    res.statusMessage = 'Not found'
  }

  let url = req.url
  if (url === '/') url = '/index.html'
  if (!url.startsWith(args.prefix)) {
    await serveFile(req, res, url)
  } else if (url.length < (args.prefix + ' ').length) {
    res.write('Invalid packet specification')
  } else {
    const packet = url.split('/').slice(2).join('/')
    await servePacket(packet, req, res)
  }
  res.end()
})

const listener = server.listen(args.port, () => {
  print('Server listening on ', listener.address())
  print('  * log level: ', args.loglevel)
  print('  * configured prefix for packages: ', args.prefix)
  print('  * configured storage: ', args.storage)
  print('  * fetching packages from: ', args.registry)
  print('  * serving static files from: ', args.documentRoot)
  print('  * cache max-age: ', args.maxage)
  print('  * npm update interval: ', args.npmUpdateInterval)
  print('  * cors headers enabled: ', args.cors)
  print('')
  logger.info('Server started')
})
