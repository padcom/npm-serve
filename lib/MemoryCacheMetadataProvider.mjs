/**
 * Metadata provider that stores the values in memory
 */
export class MemoryCacheMetadataProvider {
  #cache = new Map()
  #refresh = 10

  constructor(refresh = 10) {
    this.#refresh = refresh
  }

  async isCached(fullname) {
    return this.#cache.has(fullname)
  }

  async get(fullname) {
    if (!this.#cache.has(fullname)) throw new Error(`Package ${fullname} not cached`)
    return this.#cache.get(fullname)
  }

  async set(fullname, metadata) {
    const refresh = this.#refresh
    if (metadata) {
      this.#cache.set(fullname, {
        ...metadata,
        timestamp: Date.now(),
        isOutdated() {
          return Date.now() - this.timestamp > refresh
        },
      })
    } else {
      this.#cache.delete(fullname)
    }
  }
}
