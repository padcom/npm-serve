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

const args = minimist(process.argv.slice(2))
args.q = args.quiet = args.q || args.quiet || false
args.p = args.port = args.p || args.port || 2998
args.s = args.storage = args.s || args.storage || './packages'
args.r = args.registry = args.r || args.registry || 'https://registry.npmjs.org'
args.L = args.loglevel = args.L || args.loglevel || 'info'
args.documentRoot = args._[0] || '.'

if (args.h || args.help) {
  console.log(`@padcom/npm-serve by ${pkg.author}`)
  console.log(`usage:`)
  console.log(`  ${pkg.name} [-q] [-s storage] [-r registry] [-p port] [-L loglevel] [document_root]`)
  console.log(`  ${pkg.name} -V | --version # show program version and exit`)
  console.log(`  ${pkg.name} -h | --help # show help and exit`)
  process.exit(0)
}

if (args.V || args.version) {
  console.log(pkg.version)
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
    info:     s => s,
    warn:     chalk.yellow,
    error:    chalk.red,
  }

  static CONTENT_COLORS = {
    trace:    chalk.dim.gray,
    debug:    chalk.dim.gray,
    info:     s => s,
    warn:     s => s,
    error:    s => s,
  }

  #level

  constructor(level = 'info') {
    if (!Logger.LEVELS[level]) {
      console.log('WARN: Given loglevel', level, 'is invalid. Reverting to "info"')
    }
    this.#level = Logger.LEVELS[level] || 'info'
  }

  #log(level, ...args) {
    const parts = [
      chalk.bold(new Date().toISOString()),
      chalk.cyan('[') + Logger.LEVEL_COLORS[level](level.padEnd(5)) + chalk.cyan(']'),
      Logger.CONTENT_COLORS[level](...args)
    ]
    console.log(...parts)
  }

  trace(...args) {
    if (this.#level >= Logger.LEVELS.trace) this.#log('trace', ...args)
  }

  debug(...args) {
    if (this.#level >= Logger.LEVELS.debug) this.#log('debug', ...args)
  }

  info(...args) {
    if (this.#level >= Logger.LEVELS.info) this.#log('info', ...args)
  }

  warn(...args) {
    if (this.#level >= Logger.LEVELS.warn) this.#log('warn', ...args)
  }

  error(...args) {
    if (this.#level >= Logger.LEVELS.error) this.#log('error', ...args)
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
        return Date.now() - this.timestamp > 30 * 1000
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
        logger.error('unable to refresh package', CACHE_KEY, ':', e)
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
      res.setHeader('location', `/package/${scope}/${name}@${version}/${path}`)
    } else {
      if (!exists(filename)) {
        await download(location, filename)
      } else {
        logger.debug('File', filename, 'already exists - not downloading')
      }
      res.setHeader('Content-Type', contentType)
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Cache-Control', 'max-age=30')
      if (getETagFor(filename) === req.headers['if-none-match']) {
        res.statusCode = 304
      } else {
        res.setHeader('etag', await getETagFor(filename))
        await streamArchiveFile(filename, path, res)
      }
    }
  } catch (e) {
    console.error('ERROR:', e)
    if (e.code && e.error) {
      res.statusCode = e.code
      res.statusMessage = e.error
    } else {
      res.statusCode = 500
      res.statusMessage = 'Unknown error + "' + e + '"'
    }
  }
}

/**
 * Substitute the packages given in query string with the new values.
 *
 * For local development servr substitutions:
 *   1. replace https://unpkg.com/{package}{@version}{path} with http://localhost:2999{path}
 *
 * https://unpkg.com/@padcom/mf-test-common + @padcom/mf-test-common=http://localhost:2999
 *   http://localhost:2999
 * https://unpkg.com/@padcom/mf-test-common/dist/index.js + @padcom/mf-test-common=http://localhost:2999
 *   http://localhost:2999/dist/index.js
 * https://unpkg.com/@padcom/mf-test-common@0/dist/index.js + @padcom/mf-test-common=http://localhost:2999
 *   http://localhost:2999/dist/index.js*
 *
 * For version changes:
 *   1. replace https://unpkg.com/${package}{@version}{path} with /package/${package}@{version}{path}
 *
 * https://unpkg.com/@padcom/mf-test-common@0/dist/index.js + @padcom/mf-test-common=0.0.5
 *   /package/@padcom/mf-test-common@0.0.5/dist/index.js
 * https://unpkg.com/@padcom/mf-test-common@0/dist/style.css + @padcom/mf-test-common=0.0.5
 *   /package/@padcom/mf-test-common@0.0.5/dist/style.css
 * https://unpkg.com/@padcom/mf-test-common/dist/style.css + @padcom/mf-test-common=0.0.5
 *   /package/@padcom/mf-test-common@0.0.5/dist/style.css
 *
 * @param {IncomingMessage} req request
 * @param {String} content original content as it was read from disk
 */
function processSubstitutes(req, content) {
  const source = req.headers.referer ? req.headers.referer : 'x://x/' + req.url
  const substitutions = new URL(source).searchParams

  substitutions.forEach((value, name) => {
    if (value.startsWith('http')) {
      const rx = /(https:\/\/unpkg\.com)\/(.+)(['"`])/g
      content = content.replaceAll(rx, (match, host, path, ending) => {
        const parsed = new LocationParser().parse(path)
        const parsedName = parsed.scope ? `${parsed.scope}/${parsed.name}` : parsed.name
        const specified = new URL(value)
        specified.pathname = parsed.path ? `/${parsed.path}` : path

        return name === parsedName ? `${specified.toString()}${ending}` : match
      })
    } else {
      const rx = /(https:\/\/unpkg\.com)\/(.+)(['"`])/g
      content = content.replaceAll(rx, (match, host, path, ending) => {
        const parsed = new LocationParser().parse(path)
        const parsedName = parsed.scope ? `${parsed.scope}/${parsed.name}` : parsed.name
        const version = value ? `@${value}` : ''
        const parsedPath = parsed.path ? `/${parsed.path}` : ''

        return name === parsedName ? `/package/${parsedName}${version}${parsedPath}${ending}` : match
      })
    }
  })

  return content.replaceAll('https://unpkg.com', '/package')
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
    if (getETagFor(filename) === req.headers['if-none-match']) {
      res.statusCode = 304
    } else {
      res.setHeader('etag', await getETagFor(filename))
      let content = (await readFile(filename)).toString()
      if (['text/html', 'application/javascript'].includes(contentType)) {
        content = processSubstitutes(req, content)
      }
      res.write(content)
    }
  } else {
    logger.error(filename, 'not found')
  }
}

const server = createServer(async (req, res) => {
  if (!['GET', 'OPTIONS'].includes(req.method)) {
    res.statusCode = 404
    res.statusMessage = 'Not found'
  }

  let url = req.url
  if (url === '/') url = '/index.html'
  if (!url.startsWith('/package/')) {
    await serveFile(req, res, url)
  } else if (url.length < '/package/ '.length) {
    res.write('Invalid packet specification')
  } else {
    const packet = url.split('/').slice(2).join('/')
    await servePacket(packet, req, res)
  }
  res.end()
})

const listener = server.listen(args.port, () => {
  const messages = [
    'Server listening on', listener.address(),
    '  * configured storage:', args.storage,
    '  * fetching packages from:', args.registry,
    '  * serving static files from:', args.documentRoot,
  ]
  if (!args.quiet) {
    console.log(messages.join('\n'))
    console.log('')
  }
})
