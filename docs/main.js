import { events } from '@padcom/mf-test-common'
import { createApp } from 'vue'

// Vue.js and React require this (simulates dotenv)
globalThis.process = { env: { NODE_ENV: 'development' } }
// Vue.js requires this (silents console warnings)
globalThis.__VUE_OPTIONS_API__ = false
globalThis.__VUE_PROD_DEVTOOLS__ = false

async function sleep(ms, msg = `[HOST] System initialization in progress - waiting ${ms / 1000} seconds...`) {
  // if (msg) console.log(msg)
  // return new Promise(resolve => setTimeout(resolve, ms))
}

function loadStylesheets(stylesheets) {
  for (const stylesheet of stylesheets) {
    loadStylesheet(stylesheet)
  }
}

function loadStylesheet(stylesheet) {
  console.log('[HOST] Dynamically importing', stylesheet)
  const link = document.createElement('link')
  link.setAttribute('rel', 'stylesheet')
  link.setAttribute('type', 'text/css')
  link.setAttribute('href', stylesheet)
  document.head.appendChild(link)
}

async function start(root, url, stylesheets = []) {
  console.time('[HOST] Starting microfrontend ' + url + ' took')
  if (!Array.isArray(stylesheets)) stylesheets = [ stylesheets ]

  loadStylesheets(stylesheets)

  console.log(`[HOST] Dynamically importing ${url} exports...`)
  const { start } = await import(url)
  console.log('[HOST] Exports loaded:')
  console.log('[HOST] > start =', start)
  console.log('')

  await sleep(1000)

  console.log('[HOST] Instantiating microfrontend')
  const app = await start(root, 'Jane Smith')
  console.log('[HOST] app =', app)
  console.log('')

  await sleep(1000)

  console.timeEnd('[HOST] Starting microfrontend ' + url + ' took')

  return app
}

async function startApp(root, url, stylesheets = []) {
  console.time('[HOST] Starting application ' + url + ' took')
  if (!Array.isArray(stylesheets)) stylesheets = [ stylesheets ]

  loadStylesheets(stylesheets)

  console.log(`[HOST] Dynamically importing ${url} exports...`)
  const { App } = await import(url)
  console.log('[HOST] Exports loaded:')
  console.log('[HOST] > start =', App)
  console.log('')

  await sleep(1000)

  console.log('[HOST] Instantiating microfrontend')
  const app = createApp(App).mount(root)
  console.log('[HOST] app =', app)
  console.log('')

  await sleep(1000)

  console.timeEnd('[HOST] Starting application ' + url + ' took')

  return app
}

async function main() {
  console.time('[HOST] System initialized.')
  await sleep(5000, '[HOST] System initialization started - waiting 5 seconds...')

  const CDN = 'https://unpkg.com/'

  await Promise.all([
    start(document.getElementById('app1'), CDN + '@padcom/mf-test-library1'),
    start(document.getElementById('app2'), CDN + '@padcom/mf-test-library2@beta'),
    start(document.getElementById('app3'), CDN + '@padcom/mf-test-library3', CDN + '@padcom/mf-test-library3/dist/style.css'),
    start(document.getElementById('app4'), CDN + '@padcom/mf-test-library4'),
  ])

  console.time('[HOST] Instantiating a microfrontend with host-provided and NOT cached dependencies took')
  await start(document.getElementById('app5'), CDN + '@padcom/mf-test-library5', CDN + '@padcom/mf-test-library5/dist/style.css'),
  console.timeEnd('[HOST] Instantiating a microfrontend with host-provided and NOT cached dependencies took')

  console.time('[HOST] Instantiating a microfrontend with host-provided and cached dependencies took')
  const app = await start(document.getElementById('app6'), CDN + '@padcom/mf-test-library6', CDN + '@padcom/mf-test-library6/dist/style.css')
  console.log('[HOST] Removing last app so it can be instantiated using clickme from library5')
  app.unmount()
  console.log('[HOST] App removed')
  // await start(document.getElementById('app6'), 'http://localhost:3006/index.js', 'http://localhost:3006/style.css'),
  await start(document.getElementById('app6'), CDN + '@padcom/mf-test-library6', CDN + '@padcom/mf-test-library6/dist/style.css')
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

main()
