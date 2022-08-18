import AsyncLock from 'async-lock'

export class Locks {
  #locks = new Map()

  get(fullname) {
    if (!this.#locks.has(fullname)) {
      const lock = new AsyncLock()
      lock.fullname = fullname
      this.#locks.set(fullname, lock)
    }
    return this.#locks.get(fullname)
  }
}
