import { createHash } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import zlib from 'node:zlib'
import tar from 'tar-stream'
import { mkdir } from 'node:fs/promises'
import { existsSync as exists, createWriteStream, createReadStream } from 'node:fs'

import http from 'node:http'
import https from 'node:https'

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

    source.pipe(gunzip).pipe(extract)
  })
}

export async function getETagFor(file) {
  const stats = await stat(file)
  return createHash('sha1').update(stats.mtime.toISOString()).digest('hex')
}

export function waitFor(callback, timeout = 10000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const handler = async () => {
      const result = await callback()
      if (result) {
        cleanup()
        resolve(result)
      } else if (Date.now() - start > timeout) {
        cleanup()
        reject('Timeout')
      }
    }
    const timer = setInterval(handler, 10)
    const cleanup = () => {
      clearInterval(timer)
    }
  })
}

export async function runSingleWithLockAndKey(lock, key, callback) {
  // key = `${lock.fullname}/${key}`
  if (!lock.isBusy(key)) {
    return await lock.acquire(key, async () => lock.result = await callback())
  } else {
    return await lock.acquire(key, () => lock.result)
  }
}
