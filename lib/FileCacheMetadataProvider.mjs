import { join, dirname } from 'node:path'
import { existsSync as exists } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { extract } from './utils.mjs'

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
    const metadata = await readFile(this.#getMetadataFilename(fullname))
    return JSON.parse(metadata)
  }

  async set(fullname, metadata) {
    await mkdir(this.#getMetadataFolder(fullname), { recursive: true })
    await writeFile(this.#getMetadataFilename(fullname), JSON.stringify(metadata, null, 2))
  }

  getArchiveFileName(fullname, version) {
    return join(this.#storage, fullname + '-' + version + '.tgz')
  }

  async extract(fullname, version, path, output) {
    await extract(this.getArchiveFileName(fullname, version), 'package/' + path, output)
  }
}
