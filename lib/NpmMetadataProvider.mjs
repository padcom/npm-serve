import { join } from 'node:path'
import { download } from './utils.mjs'

/**
 * Metadata provider that reads the data from an NPM registry
 */
export class NpmMetadataProvider {
  #registry = null

  constructor(registry = 'https://registry.npmjs.org') {
    this.#registry = registry
  }

  #getPackageMetadataUrl(fullname) {
    return join(this.#registry, fullname)
  }

  async get(fullname) {
    return fetch(this.#getPackageMetadataUrl(fullname)).then(response => response.json())
  }

  #getArchiveURL(scope, name, version) {
    if (scope) {
      return `${this.#registry}/${scope}/${name}/-/${name}-${version}.tgz`
    } else {
      return `${this.#registry}/${name}/-/${name}-${version}.tgz`
    }
  }

  /**
   * Download the package archive in the specified version to the file on disk
   *
   * @param {String} scope package scope (empty string if package is not scoped)
   * @param {String} name package name
   * @param {String} version package version
   * @param {String} filename name of the file to store the downloaded package locally
   */
  async downloadPackageTarball(scope, name, version, filename) {
    return download(this.#getArchiveURL(scope, name, version), filename)
  }
}
