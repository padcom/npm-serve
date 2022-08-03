declare global {
  /**
   * Checks if the given library (e.g. @padcom/mf-test-library1) is registered
   *
   * @param {String} name full name of the library (including scope if the package is scoped)
   */
  function isLibraryRegistered(name: string): boolean

  interface LibraryMetadata {
    fullname: string
    scope: string
    name: string
    version: string
    main: string
    root: string
  }

  /**
   * Returns library metadata from library full name (e.g. @padcom/mf-test-library1)
   *
   * @param {String} name full name of the library (including scope if the package is scoped)
   * @throws throws an error if the library is not registered
   */
  function getLibraryMetadata(name: string): LibraryMetadata

  /**
   * Return the root (including hostname, port and prefix) of the given library, e.g.
   *
   * https://unpkg.com/@padcom/mf-test-library5@0.0.4
   *
   * @param {String} name name of the library
   */
  function getLibraryRoot(name: string): string

  /**
   * Load stylesheets (.css) from the given library.
   * Styles are loaded only once and cached.
   *
   * @param {String} name library to load stylesheets from
   */
  function loadStylesheetsFromLibrary(name: string): void

  /**
   * Unload stylesheets that have been loaded from a library
   * Once styles have been unloaded they can be again loaded using
   * loadStylesheetsFromLibrary() function
   *
   * @param {String} name library to unload stylesheets from
   */
  function unloadStylesheetFromLibrary(name: string): void
}
