import { existsSync as exists } from 'node:fs'
import { join } from 'node:path'

import express from 'express'
import mime from 'mime'

import { MemoryCacheMetadataProvider } from './MemoryCacheMetadataProvider.mjs'
import { FileCacheMetadataProvider } from './FileCacheMetadataProvider.mjs'
import { NpmMetadataProvider } from './NpmMetadataProvider.mjs'
import { Locks } from './Locks.mjs'
import { max as maxVersion } from './version.mjs'
import { parse as parseNpmCoordinates } from './npm-coordinates-parser.mjs'
import { getETagFor, runSingleWithLockAndKey as locked } from './utils.mjs'

const schedule = setImmediate

export default function({
  storage = './packages',
  registry = 'https://registry.npmjs.org',
  cors = false,
  maxage = 30,
  npmUpdateInterval = 1,
} = {}) {
  const router = new express.Router()

  const cache = new MemoryCacheMetadataProvider(npmUpdateInterval * 1000)
  const file = new FileCacheMetadataProvider(storage)
  const npm = new NpmMetadataProvider(registry)
  const locks = new Locks()

  // teach express.js how to process "coordinates"
  router.param('coordinates', async (request, response, next, coordinates) => {
    const pkg = parseNpmCoordinates(coordinates)
    pkg.lock = locks.get(pkg.fullname)

    // get package metadata from cache, filesystem or npm registry
    if (await cache.isCached(pkg.fullname)) {
      pkg.metadata = await cache.get(pkg.fullname)
      if (pkg.metadata.isOutdated()) {
        // schedule metadata update
        schedule(async () => {
          pkg.metadata = await locked(pkg.lock, 'metadata', () => {
            return npm.get(pkg.fullname).catch(error => { logger.error(error) })
          })
          await locked(pkg.lock, 'metadata-file', () => file.set(pkg.fullname, pkg.metadata))
          await cache.set(pkg.fullname, pkg.metadata)
          logger.debug('Package metadata', pkg.fullname, 'updated')
        })
      }
    } else if (await file.isCached(pkg.fullname)) {
      logger.debug('Fetching metadata of package', pkg.fullname, 'from local disk cache')
      pkg.metadata = await locked(pkg.lock, 'metadata', () => file.get(pkg.fullname))
      await locked(pkg.lock, 'metadata-file', () => file.set(pkg.fullname, pkg.metadata))
      await cache.set(pkg.fullname, pkg.metadata)
      logger.debug('Package metadata', pkg.fullname, 'updated')
    } else {
      logger.debug('Fetching metadata of package', pkg.fullname, 'from npm registry')
      pkg.metadata = await locked(pkg.lock, 'metadata', () => npm.get(pkg.fullname))
      if (pkg.metadata?.error) delete pkg.metadata
      await locked(pkg.lock, 'metadata-file', () => file.set(pkg.fullname, pkg.metadata))
      await cache.set(pkg.fullname, pkg.metadata)
      logger.debug('Package metadata', pkg.fullname, 'updated')
    }

    if (!pkg.metadata) {
      response.status(404)
      response.send('Not found')
      response.end()
      logger.info('Package', pkg.fullname, 'not found')
    } else {
      // figure out a version that actually exists
      const versions = Object.keys(pkg.metadata.versions)
      const latest = pkg.metadata['dist-tags']['latest']
      pkg.selectedVersion = pkg.metadata['dist-tags'][pkg.version] || maxVersion(pkg.version, versions, latest)
      // figure out the path to serve
      pkg.selectedPath = pkg.path || pkg.metadata.versions[pkg.selectedVersion]?.main

      // update request so that the parsed information is available to the request handler
      request.coordinates = pkg

      next()
    }
  })

  // teach express.js how to serve content from a tgz archive
  router.get('/:coordinates([^/]*)', async (request, response) => {
    const pkg = request.coordinates

    logger.debug('Requested', request.originalUrl)

    try {
      if (pkg.version !== pkg.selectedVersion || pkg.path !== pkg.selectedPath) {
        // this is not a request that we can serve as such because it contains templated
        // information, not a fully qualified location of a file from a package in a specific
        // version. Therefore we'll do a 302 redirect to the full location
        const url = join(request.baseUrl || '/', pkg.fullname + '@' + pkg.selectedVersion, '/', pkg.selectedPath)
        response.redirect(url)
        logger.debug('Redirecting', request.baseUrl + request.path, 'to', url)
      } else {
        // this is a fully-qualified request to serve a file from the given
        // package in the given version
        const archive = file.getArchiveFileName(pkg.fullname, pkg.selectedVersion)
        if (!exists(archive)) {
          await locked(pkg.lock, 'tarball', async () => {
            await npm.downloadPackageTarball(pkg.scope, pkg.name, pkg.version, archive)
          })
        }
        // set response headers
        const etag = await getETagFor(archive)
        response.set('etag', etag)
        response.set('cache-control', 'max-age=' + maxage)
        response.set('content-type', mime.getType(pkg.selectedPath))
        if (etag === request.get('if-none-match')) {
          // this request is no different than the one already known to the client
          response.status(304)
        } else {
          // serve the requested path from package, which will be unpacked in-memory
          // and the given file will be piped through to response
          try {
            await file.extract(pkg.fullname, pkg.version, pkg.selectedPath, response)
          } catch (e) {
            response.status(e.code)
            response.send(e.error)
            logger.error(e)
          }
        }
      }
    } catch (e) {
      response.status(500)
      response.send(e.toString())
      logger.error(e)
    } finally {
      response.end()
    }
  })

  return router
}
