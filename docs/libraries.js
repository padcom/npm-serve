const LIBRARIES = JSON.parse(document.scripts.imports.innerText).imports

export function isLibraryRegistered(library) {
  return Boolean(LIBRARIES[library])
}

export function getLibraryMetadata(library) {
  return LIBRARIES[library]
}

export function registerLibraryStylesheet(library, stylesheet) {
  getLibraryMetadata(library)?.stylesheets.push(stylesheet)
}

function loadStylesheet(stylesheet) {
  console.log('[HOST] Dynamically importing', stylesheet)
  const link = document.createElement('link')
  link.setAttribute('rel', 'stylesheet')
  link.setAttribute('type', 'text/css')
  link.setAttribute('href', stylesheet)
  document.head.appendChild(link)
}

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

for (const [library, origin] of Object.entries(LIBRARIES)) {
  const isAbsoluteOrigin = origin.startsWith('http://') || origin.startsWith('https://')
  const isDevelopment = origin.startsWith('http://localhost:')
  const url = new URL(isAbsoluteOrigin ? origin : window.location.origin + origin)
  const cdn = isAbsoluteOrigin ? url.origin : '/package'
  const prefixLength = isAbsoluteOrigin ? 0 : 1
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
