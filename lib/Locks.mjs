import AsyncLock from 'async-lock'

/**
 * Locks registry
 */
export class Locks {
  #locks = new Map()

  /**
   * Get lock by name
   *
   * @param {String} name name of the lock
   * @returns {AsyncLock} lock
   */
  get(name) {
    if (!this.#locks.has(name)) {
      const lock = new AsyncLock()
      lock.name = name
      this.#locks.set(name, lock)
    }
    return this.#locks.get(name)
  }
}
