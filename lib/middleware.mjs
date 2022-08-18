import { existsSync as exists } from 'node:fs'
import { join } from 'node:path'
import mime from 'mime'
import express from 'express'

import { max as maxVersion } from './version.mjs'
import { parse as parseNpmCoordinates } from './npm-coordinates-parser.mjs'

import { MemoryCacheMetadataProvider } from './MemoryCacheMetadataProvider.mjs'
import { FileCacheMetadataProvider } from './FileCacheMetadataProvider.mjs'
import { NpmMetadataProvider } from './NpmMetadataProvider.mjs'
import { getETagFor, waitFor } from './utils.mjs'

export default function({
  npmUpdateInterval = 1,
  storage = './packages',
  registry = 'https://registry.npmjs.org',
  cors = false,
  maxage = 30,
} = {}) {
  const router = new express.Router()

  const cache = new MemoryCacheMetadataProvider(npmUpdateInterval * 1000)
  const file = new FileCacheMetadataProvider(storage)
  const npm = new NpmMetadataProvider(registry)

  // teach express.js how to process "coordinates"
  router.param('coordinates', async (request, response, next, coordinates) => {
    const pkg = { ...parseNpmCoordinates(coordinates) }

    // get package metadata from cache, filesystem or npm registry
    if (await cache.isCached(pkg.fullname)) {
      pkg.metadata = await cache.get(pkg.fullname)
      if (pkg.metadata.isOutdated) setImmediate(async () => {
        const metadata = await npm.get(pkg.fullname)
        await file.set(pkg.fullname, metadata)
        await cache.set(pkg.fullname, metadata)
      })
    } else if (await file.isCached(pkg.fullname)) {
      pkg.metadata = await file.get(pkg.fullname)
      await cache.set(pkg.fullname, pkg.metadata)
    } else {
      pkg.metadata = await npm.get(pkg.fullname)
      if (pkg.metadata.error) {
        delete pkg.metadata
      } else {
        await file.set(pkg.fullname, pkg.metadata)
        await cache.set(pkg.fullname, pkg.metadata)
      }
    }

    if (!pkg.metadata) {
      response.status(404)
      response.send('Not found')
      response.end()
      logger.info('Package', pkg.fullname, 'not found')
    } else {
      // coerce on a version that actually exists
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

  // teach express.js how to serve content of a tgz archive
  router.get('/:coordinates([^/]*)', async (request, response) => {
    const { metadata, ...pkg } = request.coordinates

    try {
      if (pkg.version !== pkg.selectedVersion || pkg.path !== pkg.selectedPath) {
        const url = join(request.baseUrl || '/', pkg.fullname + '@' + pkg.selectedVersion, '/', pkg.selectedPath)
        response.redirect(url)
        logger.info('Redirecting', request.path, 'to', url)
      } else {
        const archive = file.getArchiveFileName(pkg.fullname, pkg.selectedVersion)
        await downloadPackageTarball(archive, pkg, npm)
        const etag = await getETagFor(archive)
        response.set('etag', etag)
        response.set('cache-control', 'max-age=' + maxage)
        response.set('content-type', mime.getType(pkg.selectedPath))
        if (cors) response.set('access-control-allow-origin', '*')
        if (etag === request.get('if-none-match')) {
          response.status(304)
        } else {
          try {
            await file.extract(pkg.fullname, pkg.version, pkg.selectedPath, response)
          } catch (e) {
            response.status(e.code)
            response.send(e.error)
          }
        }
      }
    } catch (e) {
      response.statusCode = 500
    } finally {
      response.end()
    }
  })

  return router

  async function downloadPackageTarball(archive, pkg) {
    if (!exists(archive)) {
      if (!pkg.isBeingDownloaded) {
        pkg.isBeingDownloaded = true
        try {
          await npm.download(pkg.scope, pkg.name, pkg.selectedVersion, archive)
        } finally {
          delete pkg.isBeingDownloaded
        }
      } else {
        await waitFor(() => !pkg.isBeingDownloaded)
      }
    }
  }
}
