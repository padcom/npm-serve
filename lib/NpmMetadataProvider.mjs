import { join } from 'node:path'
import { download } from './utils.mjs'

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

  async download(scope, name, version, filename) {
    return download(this.#getArchiveURL(scope, name, version), filename)
  }
}
