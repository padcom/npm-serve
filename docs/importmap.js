const {
  isLibraryRegistered,
  getLibraryMetadata,
  getLibraryRoot,
  loadStylesheetsFromLibrary,
  unloadStylesheetFromLibrary,
} = (() => {
  const { libraries, config } = loadImportmapTemplates()
  if (config.overrides) applyOverridesFromQueryString(libraries)
  saveImportmap(createImportmap(libraries))

  return { isLibraryRegistered, getLibraryMetadata, getLibraryRoot, loadStylesheetsFromLibrary, unloadStylesheetFromLibrary }

  /**
   * Checks if the given library (e.g. @padcom/mf-test-library1) is registered
   *
   * @param {String} name full name of the library (including scope if the package is scoped)
   */
  function isLibraryRegistered(name) {
    return libraries.some(lib => lib.fullname === name)
  }

  /**
   * Returns library metadata from library full name (e.g. @padcom/mf-test-library1)
   *
   * @param {String} name full name of the library (including scope if the package is scoped)
   * @throws throws an error if the library is not registered
   */
  function getLibraryMetadata(name) {
    if (!isLibraryRegistered(name)) throw new Error(`Library ${name} not defined`)
    return libraries.find(lib => lib.fullname === name)
  }

  /**
   * Return the root (including hostname, port and prefix) of the given library, e.g.
   *
   * https://unpkg.com/@padcom/mf-test-library5@0.0.4
   *
   * @param {String} name name of the library
   */
  function getLibraryRoot(name) {
    const library = getLibraryMetadata(name)
    if (library.isDevelopment) {
      return library.cdn || config.cdn
    } else {
      const cdn = library.cdn || config.cdn
      const fullname = library.fullname
      const version = library.version ? `@${library.version}` : ''
      return `${cdn}${fullname}${version}`
    }
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

    return link
  }

  /**
   * Load stylesheets (.css) from the given library.
   * Styles are loaded only once and cached.
   *
   * @param {String} name library to load stylesheets from
   */
  function loadStylesheetsFromLibrary(name) {
    const library = getLibraryMetadata(name)
    if (library.stylesheetsLoaded) return

    for (const stylesheet of library.stylesheets) {
      const root = getLibraryRoot(name)
      library.loadedStylesheets.push(loadStylesheet(`${root}/${stylesheet}`))
      library.stylesheetsLoaded = true
    }
  }

  /**
   * Unload stylesheets that have been loaded from a library
   * Once styles have been unloaded they can be again loaded using
   * loadStylesheetsFromLibrary() function
   *
   * @param {String} name library to unload stylesheets from
   */
  function unloadStylesheetFromLibrary(name) {
    const library = getLibraryMetadata(name)
    if (!library.stylesheetsLoaded) return

    for (const stylesheet of library.loadedStylesheets) {
      stylesheet.remove()
    }

    library.loadedStylesheets = []
    library.stylesheetsLoaded = false
  }

  /**
   * Parse NPM coordinates like so: @scope/name@version/path/file.txt
   *
   * @param {String} coords NPM coordinates to parse
   */
  function parseNpmCoordinates(coords, prefixLength = 0) {
    const parts = coords.split('/').filter(x => x)
    const scope = parts[0][0] === '@' ? parts[0] : ''
    const nameParts = scope ? parts[1].split('@') : parts[0].split('@')
    const name = nameParts[0]
    const version = nameParts[1] || 'latest'
    const main = (scope ? parts.slice(2) : parts.slice(1)).join('/')
    const fullname = scope ? scope + '/' + name : name
    const root = `${fullname}${version ? '@' + version : ''}`

    return { fullname, scope, name, version, main, root, stylesheets: [], loadedStylesheets: [] }
  }

  /**
   * Parse defined libraries
   */
  function parseLibraries(libraries) {
    return libraries.map(library =>
      typeof library === 'string'
        ? parseNpmCoordinates(library)
        : { ...parseNpmCoordinates(library.library), stylesheets: library.stylesheets }
    )
  }

  /**
   * Safely parse JSON and if there are any errors returns null
   *
   * @param {String} source JSON to parse
   * @return {Object|null} parsed JSON or null if error occured
   */
  function safeParseJSON(source) {
    try {
      return JSON.parse(source)
    } catch (e) {
      console.error(e)
      return null
    }
  }

  /**
   * Load template for producing the importmap from JSON stored in <script type="libraries">
   */
  function loadImportmapTemplates() {
    return [...document.scripts]
      .filter(script => script.type === 'libraries')
      .map(script => safeParseJSON(script.text))
      .filter(script => script)
      .map(script => ({
        libraries: parseLibraries(script.libraries),
        config: script.config
      }))
      .reduce((acc, script) => {
        return {
          libraries: [...acc.libraries, ...script.libraries ],
          config: { ...acc.config, ...script.config },
        }
      }, { libraries: [] })
  }

  /**
   * Checks if te given URL is a valid http(s) URL
   *
   * @param {String} source URL to check
   */
  function isValidUrl(source) {
    try {
      const url = new URL(source)
      return [ 'http:', 'https:' ].includes(url.protocol)
    } catch {
      return false
    }
  }

  /**
   * Take query string parameters in the form of package=override, e.g.
   *   @padcom/mf-test-library5=http://localhost:5001/dist/index.js
   * or
   *   @padcom/mf-test-library5=0.0.5
   * or
   *   @padcom/mf-test-library5=latest
   *
   * and configure the library loader to use the override instead.
   */
  function applyOverridesFromQueryString() {
    const params = new URLSearchParams(window.location.search)
    return [...params.entries()].forEach(([name, override]) => {
      const library = libraries.find(lib => lib.fullname === name)
      if (isValidUrl(override)) {
        const url = new URL(override)
        library.isDevelopment = url.hostname === 'localhost'
        library.cdn = url.origin
        library.main = url.pathname.slice(1) || library.main
        library.version = ''
      } else {
        library.version = override
      }
    })
  }

  /**
   * Creates import map based on the given libraries
   */
  function createImportmap(libraries) {
    return {
      imports: libraries
        .map(library => {
          const root = getLibraryRoot(library.fullname)
          const main = library.main ? '/' + library.main : ''
          return { [library.fullname]: `${root}${main}` }
        })
        .reduce((acc, library) => ({ ...acc, ...library }), {})
    }
  }

  /**
   * Save importmap to the DOM
   */
  function saveImportmap(importmap) {
    const script = document.createElement('script')
    script.type = 'importmap'
    script.text = JSON.stringify(importmap)
    document.head.insertAdjacentElement('beforeend', script)
  }
})()
