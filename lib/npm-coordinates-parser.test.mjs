import { parse } from './npm-coordinates-parser.mjs'

describe('NPM coordinates parser', () => {
  const cases = [
    { coordinates: 'npm-serve@latest/docs/importmap.js', name: 'npm-serve', version: 'latest', path: 'docs/importmap.js' },
    { coordinates: 'npm-serve@latest', name: 'npm-serve', version: 'latest' },
    { coordinates: 'npm-serve@2.3.4/docs/importmap.js', name: 'npm-serve', version: '2.3.4', path: 'docs/importmap.js' },
    { coordinates: 'npm-serve@2.3.4', name: 'npm-serve', version: '2.3.4' },
    { coordinates: 'npm-serve@2.3/docs/importmap.js', name: 'npm-serve', version: '2.3', path: 'docs/importmap.js' },
    { coordinates: 'npm-serve@2.3', name: 'npm-serve', version: '2.3' },
    { coordinates: 'npm-serve@2/docs/importmap.js', name: 'npm-serve', version: '2', path: 'docs/importmap.js' },
    { coordinates: 'npm-serve@2', name: 'npm-serve', version: '2' },
    { coordinates: 'npm-serve@2.3.5-beta.0/docs/importmap.js', name: 'npm-serve', version: '2.3.5-beta.0', path: 'docs/importmap.js' },
    { coordinates: 'npm-serve@2.3.5-beta.0', name: 'npm-serve', version: '2.3.5-beta.0' },
    { coordinates: 'npm-serve@2.3.5-beta/docs/importmap.js', name: 'npm-serve', version: '2.3.5-beta', path: 'docs/importmap.js' },
    { coordinates: 'npm-serve@2.3.5-beta', name: 'npm-serve', version: '2.3.5-beta' },
    { coordinates: 'npm-serve@beta', name: 'npm-serve', version: 'beta' },
    { coordinates: 'npm-serve@/', name: 'npm-serve' },
    { coordinates: 'npm-serve', name: 'npm-serve' },
    { coordinates: '@padcom/npm-serve@latest/docs/importmap.js', scope: '@padcom', name: 'npm-serve', version: 'latest', path: 'docs/importmap.js' },
    { coordinates: '@padcom/npm-serve@latest', scope: '@padcom', name: 'npm-serve', version: 'latest' },
    { coordinates: '@padcom/npm-serve@2.3.4/docs/importmap.js', scope: '@padcom', name: 'npm-serve', version: '2.3.4', path: 'docs/importmap.js' },
    { coordinates: '@padcom/npm-serve@2.3.4', scope: '@padcom', name: 'npm-serve', version: '2.3.4' },
    { coordinates: '@padcom/npm-serve@2.3/docs/importmap.js', scope: '@padcom', name: 'npm-serve', version: '2.3', path: 'docs/importmap.js' },
    { coordinates: '@padcom/npm-serve@2.3', scope: '@padcom', name: 'npm-serve', version: '2.3' },
    { coordinates: '@padcom/npm-serve@2/docs/importmap.js', scope: '@padcom', name: 'npm-serve', version: '2', path: 'docs/importmap.js' },
    { coordinates: '@padcom/npm-serve@2', scope: '@padcom', name: 'npm-serve', version: '2' },
    { coordinates: '@padcom/npm-serve@2.3.5-beta.0/docs/importmap.js', scope: '@padcom', name: 'npm-serve', version: '2.3.5-beta.0', path: 'docs/importmap.js' },
    { coordinates: '@padcom/npm-serve@2.3.5-beta.0', scope: '@padcom', name: 'npm-serve', version: '2.3.5-beta.0' },
    { coordinates: '@padcom/npm-serve@2.3.5-beta/docs/importmap.js', scope: '@padcom', name: 'npm-serve', version: '2.3.5-beta', path: 'docs/importmap.js' },
    { coordinates: '@padcom/npm-serve@2.3.5-beta', scope: '@padcom', name: 'npm-serve', version: '2.3.5-beta' },
    { coordinates: '@padcom/npm-serve@beta', scope: '@padcom', name: 'npm-serve', version: 'beta' },
    { coordinates: '@padcom/npm-serve@/', scope: '@padcom', name: 'npm-serve' },
    { coordinates: '@padcom/npm-serve', scope: '@padcom', name: 'npm-serve' },
  ]

  cases.forEach(({ coordinates, scope, name, version, path }) => {
    it(`will parse ${coordinates}`, () => {
      const parsed = parse(coordinates)
      expect(parsed).toStrictEqual({ scope, name, version, path })
    })
  })
})
