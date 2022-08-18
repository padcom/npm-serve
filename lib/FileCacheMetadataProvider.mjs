import { join, dirname } from 'node:path'
import { existsSync as exists } from 'node:fs'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { extract } from './utils.mjs'

/**
 * Metadata provider that reads metadata from files on disk
 */
export class FileCacheMetadataProvider {
  #storage = null

  constructor(storage = './packages') {
    this.#storage = storage
  }

  #getMetadataFilename(fullname) {
    return join(this.#storage, `${fullname}.json`)
  }

  #getMetadataFolder(fullname) {
    return dirname(this.#getMetadataFilename(fullname))
  }

  async isCached(fullname) {
    await mkdir(this.#getMetadataFolder(fullname), { recursive: true })
    return exists(this.#getMetadataFilename(fullname))
  }

  async get(fullname) {
    await mkdir(this.#getMetadataFolder(fullname), { recursive: true })
    try {
      const metadata = await readFile(this.#getMetadataFilename(fullname))
      return JSON.parse(metadata)
    } catch {
      try {
        const metadata = await readFile(this.#getMetadataFilename(fullname))
        return JSON.parse(metadata)
      } catch (e) {
        logger.error('Unable to read metadata file for package', fullname)
      }
    }
  }

  async set(fullname, metadata) {
    const filename = this.#getMetadataFilename(fullname)
    const folder = this.#getMetadataFolder(fullname)
    await mkdir(folder, { recursive: true })
    if (metadata) {
      await writeFile(filename, JSON.stringify(metadata, null, 2))
    } else if (exists(filename)){
      try {
        await unlink(filename)
      } catch (e) {
        logger.warn(e)
      }
    }
  }

  getArchiveFileName(fullname, version) {
    return join(this.#storage, fullname + '-' + version + '.tgz')
  }

  /**
   * Extract the given `path` from package `fullname` in `version`
   * and pipe it through to output
   *
   * @param {String} fullname full package name (including scope)
   * @param {String} version package version
   * @param {String} path path to the file
   * @param {Writeable} output `Writable` to stream the data to
   */
  async extract(fullname, version, path, output) {
    await extract(this.getArchiveFileName(fullname, version), 'package/' + path, output)
  }
}
