import { createHash } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import zlib from 'node:zlib'
import tar from 'tar-stream'
import { mkdir } from 'node:fs/promises'
import { existsSync as exists, createWriteStream, createReadStream } from 'node:fs'

import http from 'node:http'
import https from 'node:https'
import AsyncLock from 'async-lock'

/**
 * Verify if the given number is an integer
 *
 * @param {String|Number} x any value to check
 * @returns {Boolean} `true` if x is an integer, `false` otherwise
 */
export function isNumber(x) {
  try {
    return !isNaN(x) && String(x).indexOf('.') === -1
  } catch {
    return false
  }
}

/**
 * Download a file from location (url) to file (local)
 *
 * @param {String} location url where to get the file from
 * @param {String} file path to the file on disk
 * @returns {Promise<void>} an empty promise when the file has been retrieved
 */
export async function download(location, file) {
  logger.debug('Downloading file', location, 'to', file)
  return new Promise((resolve, reject) => {
    (location.startsWith('http:') ? http : https).get(location, async (res) => {
      if (res.statusCode !== 200) {
        reject({ code: 404, error: 'Not found' })
      } else {
        logger.trace('Writing file', file)
        const folder = dirname(file)
        if (!exists(folder)) await mkdir(folder, { recursive: true })
        res.on('end', () => logger.debug('File', location, 'downloaded to', file))
        res.on('end', resolve)
        res.on('error', error => logger.error(error))
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
export function extract(archive, path, output) {
  return new Promise((resolve, reject) => {
    const extract = tar.extract()
    extract.on('error', reject)
    extract.on('entry', (header, stream, next) => {
      if (header.name === path) {
        logger.trace('File', path, 'found - streaming')
        stream.pipe(output)
      }
      stream.on('end', () => {
        if (header.name === path) {
          logger.trace('File', path, 'has been transferred successfully')
        } else {
          logger.trace('Skipping', header.name)
        }
      })

      stream.on('end', () => {
        if (header.name === path) {
          extract.end()
          resolve()
        } else {
          next()
        }
      })
      stream.on('error', error => { logger.error(error) })
      stream.on('error', reject)
      stream.resume()
    })
    extract.on('finish', () => {
      reject('Not found (in archive)')
    })

    const gunzip = zlib.createGunzip()
    gunzip.on('error', error => { logger.error(error) })
    gunzip.on('error', reject)

    const source = createReadStream(archive)
    source.on('error', error => { logger.error(error) })
    source.on('error', reject)

    source.pipe(gunzip).pipe(extract)
  })
}

/**
 * Calculate an ETag for the given file
 *
 * @param {String} file name of the file to calculate ETag for
 * @returns {String} calculated ETag
 */
export async function getETagFor(file) {
  const stats = await stat(file)
  return createHash('sha1').update(stats.mtime.toISOString()).digest('hex')
}

/**
 * Runs a callback, but just once and if there are concurrent requests
 * for the same callback they will be paused and the result of the first
 * request will be returned.
 *
 * @param {AsyncLock} lock lock to use
 * @param {String} key key for the lock to use for locking
 * @param {Function} callback callback to call to do the job
 * @returns returns whatever the callback returned, awaited
 */
export async function runSingleWithLockAndKey(lock, key, callback) {
  if (!lock.isBusy(key)) {
    return lock.acquire(key, async () => lock.result = await callback())
  } else {
    return lock.acquire(key, () => lock.result)
  }
}
