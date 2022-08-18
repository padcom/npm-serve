#!/usr/bin/env node

import express from 'express'

import args from './lib/cli.mjs'
import npm from './lib/middleware.mjs'
import { Logger } from './lib/Logger.mjs'

// initialize logger
globalThis.print = args.quiet ? () => {} : console.log.bind(console)
globalThis.logger = new Logger(args.loglevel)

// initialize application
const app = express()
app.disable('x-powered-by')
app.use(args.prefix, npm(args))
app.use(express.static(args.documentRoot))

// start listening for requests
const listener = app.listen(args.port, () => {
  print('Server listening on ', listener.address())
  print('  * log level: ', args.loglevel)
  print('  * configured prefix for packages: ', args.prefix)
  print('  * configured storage: ', args.storage)
  print('  * fetching packages from: ', args.registry)
  print('  * serving static files from: ', args.documentRoot)
  print('  * cache max-age: ', args.maxage)
  print('  * npm update interval: ', args.npmUpdateInterval)
  print('  * cors headers enabled: ', args.cors)
  print('')

  logger.info('Server started')
})
