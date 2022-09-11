import minimist from 'minimist'
import pkg from '../package.json' assert { type: 'json' }
import { printalws } from './Logger.mjs'

const args = minimist(process.argv.slice(2), {
  boolean: [ 'quiet', 'version', 'cors', 'help' ],
  alias: {
    'help': 'h',
    'quiet': 'q',
    'version': 'V',
    'cors': 'C',
    'corsOrigin': [ 'cors-origin', 'O' ],
    'port': 'p',
    'storage': 's',
    'registry': 'r',
    'prefix': 'P',
    'loglevel': 'L',
    'maxage': [ 'max-age', 'M' ],
    'npmUpdateInterval': [ 'npm-update-interval', 'U' ],
  },
  default: {
    help: false,
    quiet: false,
    version: false,
    port: 2998,
    storage: './packages',
    registry: 'https://registry.npmjs.org',
    prefix: '/package/',
    loglevel: 'info',
    maxage: 30,
    cors: false,
    corsOrigin: false,
    npmUpdateInterval: 1,
  },
  unknown(name) {
    if (name.startsWith('-')) {
      console.error('error: unknown parameter:', name)
      process.exit(1)
    }
  }
})

args.documentRoot = args._[0] || '.'
if (!args.prefix.startsWith('/')) args.prefix = '/' + args.prefix
if (!args.prefix.endsWith('/')) args.prefix = args.prefix + '/'

if (args.h || args.help) {
  printalws(`@padcom/npm-serve by ${pkg.author}`)
  printalws(`usage:`)
  printalws(`  ${pkg.name} [options] document-root\n`)
  printalws(`options:`)
  printalws(`  -V, --version                              # show program version and exit`)
  printalws(`  -h, --help                                 # show help and exit`)
  printalws(`  -q, --quiet                                # suppress program banner`)
  printalws(`  -p, --port=2998                            # port to listen to for requests`)
  printalws(`  -s, --storage=packages                     # location to store packages`)
  printalws(`  -r, --registry=https://registry.npmjs.org  # upstream npm registry`)
  printalws(`  -P, --prefix=/package/                     # prefix for serving packages`)
  printalws(`  -L, --log-level=info                       # log level (trace, debug, info, warn, error)`)
  printalws(`  -C, --cors                                 # enable sending CORS headers`)
  printalws(`  -M, --max-age=30                           # max-age header to send to the browser`)
  printalws(`  -U, --npm-update-interval=1                # update interval for querying upstream npm registry`)

  process.exit(0)
}

if (args.V || args.version) {
  printalws(pkg.version)
  process.exit(0)
}

export default args
