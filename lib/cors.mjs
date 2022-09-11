export default function cors(args) {
  return (req, res, next) => {
    res.set('Access-Control-Allow-Private-Network', 'true')
    res.set('Access-Control-Allow-Origin', args.corsOrigin || req.header('Origin'))
    res.set('Access-Control-Allow-Credentials', 'true')
    res.set('Access-Control-Allow-Headers', 'Origin, Content-Type')
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
    if (req.method === 'OPTIONS') {
      res.status(204).end()
    } else {
      next()
    }
  }
}
