/** Cache for libraries */
const LIBRARIES = {}

/**
 * Checks if the given library is registered
 *
 * @param {String} name name of the library
 */
 export function isLibraryRegistered(name) {
  return Boolean(LIBRARIES[name])
}

/**
 * Retrieve library metadata by name
 *
 * @param {String} name name of the library
 */
export function getLibraryMetadata(name) {
  return LIBRARIES[name]
}

/**
 * Registers a stylesheet with the given library
 *
 * @param {Library} library the library to register the stylesheet with
 * @param {String} stylesheet path to the stylesheet file within the package's root folder
 */
export function registerLibraryStylesheet(library, stylesheet) {
  getLibraryMetadata(library)?.stylesheets.push(stylesheet)
}

/**
 * Load a stylesheet by adding it to the DOM
 *
 * @param {String} stylesheet url of the stylesheet
 */
function loadStylesheet(stylesheet) {
  const link = document.createElement('link')
  link.setAttribute('rel', 'stylesheet')
  link.setAttribute('type', 'text/css')
  link.setAttribute('href', stylesheet)
  document.head.appendChild(link)
}

/**
 * Load stylesheets (.css) from the given library.
 * Styles are loaded only once and cached.
 *
 * @param {Library} library library to load stylesheets from
 */
export function loadStylesheetsFromLibrary(library) {
  if (library.stylesheetsLoaded) return

  for (const stylesheet of library.stylesheets) {
    if (library.isDevelopment) {
      loadStylesheet(`${library.cdn}/${stylesheet}`)
    } else {
      loadStylesheet(`${library.cdn}/${library.npm.root}/${stylesheet}`)
    }
    library.stylesheetsLoaded = true
  }
}

/**
 * Parse NPM coordinates like so: /prefix/@scope/name@version/path/file.txt
 *
 * @param {String} coords NPM coordinates to parse
 * @param {Number} prefixLength number of path items to cut off of the prefix
 */
function parseNpmCoords(coords, prefixLength = 0) {
  const parts = coords.split('/').filter(x => x).slice(prefixLength)
  const scope = parts[0][0] === '@' ? parts[0] : ''
  const nameParts = scope ? parts[1].split('@') : parts[0].split('@')
  const name = nameParts[0]
  const version = nameParts[1] || ''
  const path = (scope ? parts.slice(2) : parts.slice(1)).join('/')
  const fullname = scope ? scope + '/' + name : name
  const root = `${fullname}${version ? '@' + version : ''}`

  return { fullname, scope, name, version, path, root }
}

/**
 * This function searches all the script tags within the DOM to find the one
 * with type "importmap"
 */
function discoverImportmapScript() {
  return [...document.scripts].find(script => script.type === 'importmap')
}

/**
 * Initialize the libraries subsystem
 *
 * @param {string|HTMLScriptElement|Object|undefined} imports something that will provide a list of imports. By default document.scripts will be scanned for script type="importmap"
 * @param {String} localCdn location of the local NPM CDN (default: /package, as served by npm-serve)
 * @param {Number} localCdnPrefixLength how many items of the localCdn's path need to be taken out to get to the package name
 * @param {String} remoteCdn location of the remote NPM CDN (default: https://unpkg.com, as used by npm-serve)
 * @param {Number} localCdnPrefixLength how many items of the remoteCdn's path need to be taken out to get to the package name
 */
export function initialize(
  imports = null,
  localCdn = '/package', localCdnPrefixLength = 1,
  remoteCdn = 'https://unpkg.com', remoteCdnPrefixLength = 0
) {
  if (!imports) {
    const script = discoverImportmapScript()
    if (!script) throw new Error('No import map found!')
    return initialize(script)
  } else if (typeof imports === 'string') {
    imports = JSON.parse(document.scripts[imports].innerText).imports
  } else if (imports instanceof HTMLScriptElement) {
    imports = JSON.parse(imports.innerText).imports
  } else if (typeof imports === 'object') {
    // assuming it's a key-value store containing package names with keys and locations as values
  } else {
    throw new Error('Don\'t know how to initialize with', imports)
  }

  for (const [library, origin] of Object.entries(imports)) {
    const isAbsoluteOrigin = origin.startsWith('http://') || origin.startsWith('https://')
    const isDevelopment = origin.startsWith('http://localhost:')
    const url = new URL(isAbsoluteOrigin ? origin : window.location.origin + origin)
    const cdn = isAbsoluteOrigin ? url.origin : localCdn
    const prefixLength = isAbsoluteOrigin ? remoteCdnPrefixLength : localCdnPrefixLength
    const npm = isDevelopment ? parseNpmCoords(library) : parseNpmCoords(url.pathname, prefixLength)

    LIBRARIES[library] = {
      name: library,
      npm,
      cdn,
      isDevelopment,
      stylesheets: [],
      stylesheetsLoaded: false,
    }
  }
}
