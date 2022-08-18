import { parse as parseVersion } from './version.mjs'

/**
 * Parse NPM coordinates in the following form
 *
 * @scope/package-name@version/path/within/package
 *
 * into an object like so:
 *
 * ```
 * {
 *   scope: '@scope',
 *   name: 'package-name',
 *   version: 'version',
 *   path: 'path/within/package'
 * }
 * ```
 *
 * @param {String} coordinates
 */
export function parse(coordinates) {
  const parts = coordinates.split('/').filter(x => x)
  const isScoped = parts[0].startsWith('@')
  const scope = isScoped ? parts[0] : undefined
  const [ name, version ] = (isScoped ? parts[1] : parts[0]).split('@')
  const path = (isScoped ? parts.slice(2) : parts.slice(1)).join('/')

  return {
    scope,
    name,
    fullname: isScoped ? scope + '/' + name : name,
    version: version || undefined,
    parsedVersion: parseVersion(version),
    path: path || undefined,
  }
}
