import { createApp } from 'vue'
import { events } from '@padcom/mf-test-common'

async function start(root, library) {
  library = getLibraryMetadata(library)

  console.time('[HOST] Starting microfrontend ' + library.fullname + ' took')

  loadStylesheetsFromLibrary(library.fullname)

  console.log(`[HOST] Dynamically importing ${library.fullname} exports...`)
  const { start } = await import(library.fullname)
  console.log('[HOST] Exports loaded:')
  console.log('[HOST] > start =', start)
  console.log('')

  console.log('[HOST] Instantiating microfrontend')
  const app = await start(root, 'Jane Smith')
  console.log('[HOST] app =', app)
  console.log('')

  console.timeEnd('[HOST] Starting microfrontend ' + library.fullname + ' took')

  return app
}

const APPS = {}

async function startApp(root, library) {
  library = getLibraryMetadata(library)

  if (APPS[library.fullname]) {
    unloadStylesheetFromLibrary(library.fullname)
    APPS[library.fullname].app.unmount()
    delete APPS[library.fullname]
    return null
  } else {
    console.time('[HOST] Starting application ' + library.fullname + ' took')

    loadStylesheetsFromLibrary(library.fullname)

    console.log(`[HOST] Dynamically importing ${library.fullname} exports...`)
    const { App } = await import(library.fullname)
    console.log('[HOST] Exports loaded:')
    console.log('[HOST] > App =', App)
    console.log('')

    console.log('[HOST] Instantiating microfrontend')
    const app = createApp(App)
    app.mount(root)
    console.log('[HOST] app =', app)
    console.log('')

    console.timeEnd('[HOST] Starting application ' + library.fullname + ' took')

    APPS[library.fullname] = { app }

    console.log('APPS', APPS)

    return app
  }
}

async function main() {
  console.time('[HOST] System initialized.')

  await Promise.all([
    start(document.getElementById('app1'), '@padcom/mf-test-library1'),
    start(document.getElementById('app2'), '@padcom/mf-test-library2'),
    start(document.getElementById('app3'), '@padcom/mf-test-library3'),
    start(document.getElementById('app4'), '@padcom/mf-test-library4'),
  ])

  console.time('[HOST] Instantiating a microfrontend with host-provided and NOT cached dependencies took')
  await start(document.getElementById('app5'), '@padcom/mf-test-library5'),
  console.timeEnd('[HOST] Instantiating a microfrontend with host-provided and NOT cached dependencies took')

  console.time('[HOST] Instantiating a microfrontend with host-provided and cached dependencies took')
  const app = await start(document.getElementById('app6'), '@padcom/mf-test-library6')
  console.log('[HOST] Removing last app so it can be instantiated using clickme from library5')
  app.unmount()
  console.log('[HOST] App removed')
  await start(document.getElementById('app6'), '@padcom/mf-test-library6')
  console.timeEnd('[HOST] Instantiating a microfrontend with host-provided and cached dependencies took')

  window.addEventListener('message', async (event) => {
    if (event instanceof events.StartMicrofrontendEvent) {
      console.log('[HOST] Received StartMicrofrontendEvent request', event)
      const app = await start(event.data.root, event.data.url, event.data.stylesheets)
      console.log('[HOST] Microfrontend started', app)
    } else if (event instanceof events.StartVueAppEvent) {
      console.log('[HOST] Received StartVueAppEvent request', event)
      const app = await startApp(event.data.root, event.data.url, event.data.stylesheets)
      console.log('[HOST] Application started', app)
    }
  })

  console.timeEnd('[HOST] System initialized.')
}

// Vue.js and React require this (simulates dotenv)
globalThis.process = { env: { NODE_ENV: 'development' } }
// Vue.js requires this (silents console warnings)
globalThis.__VUE_OPTIONS_API__ = false
globalThis.__VUE_PROD_DEVTOOLS__ = false

main()
