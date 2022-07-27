#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { dirname, extname, normalize } from 'node:path'
import { createReadStream, createWriteStream, existsSync as exists } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import https from 'node:https'
import { createServer } from 'http'
import zlib from 'node:zlib'
import tar from 'tar-stream'
import mime from 'mime'
import minimist from 'minimist'

const args = minimist(process.argv.slice(2))
args.p ||= 2998
args.s ||= './packages'
args.root = normalize(args._[0] || '.')

class LocationParser {
  /**
   * Example: @padcom/mf-test-library6@0.0.1/dist/index.js
   */
  parse(spec) {
    const parts = spec.split('/')
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
   * @param {String} name package name
   * @param {String} scope package scope (optional)
   */
  async fetch(name, scope = '') {
    throw new Error('Not implemented')
  }

  getDefaultPacketVersion(metadata) {
    return metadata['dist-tags'].latest
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
      return `https://registry.npmjs.org/${scope}/${name}/-/${name}-${version}.tgz`
    } else {
      return `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`
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
    const version = requestedVersion || this.getDefaultPacketVersion(metadata)
    const defaultExport = this.getDefaultPacketExport(metadata, version)
    if (!requestedPath && !defaultExport) {
      throw { code: 422, error: 'package.json/main field is empty!' }
    }
    const path = normalize(requestedPath || defaultExport)
    // console.log('latest version:', getDefaultPacketVersion(metadata))
    // console.log('scope:', scope)
    // console.log('name:', name, 'version:', version)
    // console.log('url of the package:', `https://registry.npmjs.org/${scope}/${name}/-/${name}-${version}.tgz`)
    // console.log('version "' + version + '"')
    // console.log('entrypoint', metadata.versions[version]?.main)

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
 * Download packet metadata
 * @param {String} packet packet name (including scope, packet name and optionally version)
 */
async function getPacketInfo(packet, { storage = './packages' } = {}) {
  const { scope, name, path: requestedPath, version: requestedVersion } = new LocationParser().parse(packet)
  const cache = new CacheMetadataProvider({ storage })
  const npm = new NPMMetadataProvider({ storage })
  const file = new StorageMetadataProvider({ storage })

  const CACHE_KEY = cache.getCacheKey(name, scope)
  let actualVersion = requestedVersion
  let actualPath = requestedPath

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

  const isDefaultRequest = !requestedPath || !requestedVersion
  const contentType = !isDefaultRequest ? mime.getType(extname(requestedPath)) : null

  const pkg = PACKAGE_CACHE[CACHE_KEY]

  return {
    ...pkg,
    isDefaultRequest,
    contentType,
    version: actualVersion,
    location: npm.getArchiveLocation(name, actualVersion, scope),
    file: file.getArchiveFilename(name, actualVersion, scope),
    path: actualPath,
  }

  function scheduleCacheRefresh(name, scope = '') {
    console.log('Scheduling refresh of', scope, name)
    PACKAGE_CACHE[CACHE_KEY].busy = true
    setImmediate(async () => {
      try {
        const metadata = await npm.fetch(name, scope)
        const { version, path } = npm.parse(packet, metadata)
        const location = npm.getArchiveFilename(name, version, scope)
        await cache.update(name, scope, metadata, location, path)
        console.log('Cache updated successfully for', metadata.name)
      } catch (e) {
        console.log('ERROR: unable to refresh package', CACHE_KEY, ':', e)
      }
    })
  }
}

async function download(location, file) {
  console.log('Downloading file', location, 'to', file)
  return new Promise((resolve, reject) => {
    https.get(location, async (res) => {
      if (res.statusCode !== 200) {
        reject({ code: 404, error: 'Not found' })
      } else {
        console.log('Writing file', file)
        const folder = dirname(file)
        if (!exists(folder)) await mkdir(folder, { recursive: true })
        res.on('end', () => {
          console.log('File', location, 'downloaded to', file)
          resolve()
        })
        res.on('error', reject)
        res.pipe(createWriteStream(file))
      }
    })
  })
}

function readPackageFile(path, file, target) {
  return new Promise((resolve, reject) => {
    const normalized = normalize(`./package/${path}`)

    const extract = tar.extract()
    extract.on('error', reject)
    extract.on('entry', (header, stream, next) => {
      if (header.name === normalized) {
        console.log('File', normalized, 'found - streaming')
        stream.pipe(target)
      }
      stream.on('end', () => {
        if (header.name === normalized) {
          console.log('File', normalized, 'has been transferred successfully')
          extract.end()
          resolve({ path, file })
        } else {
          console.log('Skipping', header.name)
          next()
        }
      })
      stream.on('error', reject)
      stream.resume()
    })
    extract.on('finish', () => {
      console.log('extract.on("finish")', file)
      reject({ code: 404, error: 'Not found (in archive)' })
    })

    const gunzip = zlib.createGunzip()
    gunzip.on('error', reject)
    // gunzip.on('end', () => reject({ code: 404, error: 'Not found (in archive)' }))

    const source = createReadStream(file)
    source.on('error', reject)

    console.log('Extracting', normalized, 'from', file)
    source.pipe(gunzip).pipe(extract)
  })
}

function getETagFor(file) {
  return createHash('sha1').update(file).digest('hex')
}

const server = createServer(async (req, res) => {
  if (!['GET', 'OPTIONS'].includes(req.method)) {
    res.statusCode = 404
    res.statusMessage = 'Not found'
  }

  let url = req.url
  if (url === '/') url = '/index.html'
  if (!url.startsWith('/package/')) {
    res.setHeader('Content-Type', mime.getType(url))
    const filename = normalize(`${args.root}${url}`)
    if (exists(filename)) {
      console.log('Serving', filename)
      const content = await readFile(filename)
      res.write(content)
    } else {
      console.log('ERROR:', filename, 'not found')
    }
  } else if (!url.startsWith('/package/')) {
    res.write('Not a packet request')
  } else if (url.length < '/package/ '.length) {
    res.write('Invalid packet specification')
  } else {
    const packet = url.split('/').slice(2).join('/')
    try {
      const { scope, name, location, version, path, file, contentType, isDefaultRequest } = await getPacketInfo(packet, args.s)
      if (isDefaultRequest) {
        res.statusCode = 302
        res.setHeader('access-control-allow-origin', '*')
        res.setHeader('location', `/package/${scope}/${name}@${version}/${path}`)
      } else {
        if (!exists(file)) {
          await download(location, file)
        } else {
          console.log('File', file, 'already exists - not downloading')
        }
        res.setHeader('Content-Type', contentType)
        res.setHeader('access-control-allow-origin', '*')
        if (getETagFor(file) === req.headers['if-none-match']) {
          res.statusCode = 304
          res.setHeader('Cache-Control', 'max-age=30')
        } else {
          res.setHeader('etag', getETagFor(file))
          res.setHeader('Cache-Control', 'max-age=30')
          await readPackageFile(path, file, res)
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
  res.end()
})

const listener = server.listen(args.p, () => {
  console.log('Server listening on', listener.address(), 'with storage', args.s, 'and root', args.root)
})
