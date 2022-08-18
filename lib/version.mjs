import { isNumber } from './utils.mjs'

export function parse(version) {
  if (isNumber(version)) {
    return {
      major: parseInt(version)
    }
  }
  // https://regex101.com/r/0LHqMA/1
  const RX = /^(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:\.(0|[1-9]\d*))?(?:-(?:(?:(0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))(?:\.(?:(0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)))*))?(?:\+(?:([0-9a-zA-Z-]+)(?:\.([0-9a-zA-Z-]+))*))?$/gm
  const matches = RX.exec(version)
  if (matches === null) {
    return {}
  } else {
    const result = {
      major: parseInt(matches[1]),
      minor: parseInt(matches[2]),
      patch: parseInt(matches[3]),
      tag: matches[4],
      iteration: matches[5],
      meta: matches[6],
      build: matches[7],
    }
    if (!isNumber(result.major)) delete result.major
    if (!isNumber(result.minor)) delete result.minor
    if (!isNumber(result.patch)) delete result.patch
    if (!result.tag) delete result.tag
    if (!result.iteration) delete result.iteration
    if (!result.meta) delete result.meta
    if (!result.build) delete result.build

    return result
  }
}

export function stringify(version) {
  const parts = []
  if (isNumber(version?.major)) {
    parts.push(version.major)
  }
  if (isNumber(version?.minor)) {
    if (parts.length > 0) parts.push('.')
    parts.push(version.minor)
  }
  if (isNumber(version?.patch)) {
    if (parts.length > 0) parts.push('.')
    parts.push(version.patch)
  }
  if (version?.tag) {
    if (parts.length > 0) parts.push('-')
    parts.push(version.tag)
  }
  if (version?.iteration) {
    if (parts.length > 0) parts.push('.')
    parts.push(version.iteration)
  }
  if (version?.meta) {
    if (parts.length > 0) parts.push('+')
    parts.push(version.meta)
  }
  if (version?.build) {
    if (parts.length > 0) parts.push('.')
    parts.push(version.build)
  }

  return parts.join('')
}

export function compare(a, b) {
  if (a.major > b.major) return 1
  else if (a.major < b.major) return -1
  else if (a.minor > b.minor) return 1
  else if (a.minor < b.minor) return -1
  else if (a.patch > b.patch) return 1
  else if (a.patch < b.patch) return -1
  else if (a?.tag & !b?.tag) return -1
  else if (!a?.tag & b?.tag) return 1
  else if (a.tag.localeCompare(b.tag) !== 0) return a.tag.localeCompare(b.tag)
  else if (a?.iteration & !b?.iteration) return -1
  else if (!a?.iteration & b?.iteration) return 1
  else if (a.iteration.localeCompare(b.iteration) === 0) return a.iteration.localeCompare(b.iteration)
  else if (a?.meta & !b?.meta) return -1
  else if (!a?.meta & b?.meta) return 1
  else if (a.meta.localeCompare(b.meta) !== 0) return a.meta.localeCompare(b.meta)
  else if (a?.build & !b?.build) return -1
  else if (!a?.build & b?.build) return 1
  else if (a.build.localeCompare(b.build) === 0) return a.build.localeCompare(b.build)
  else return 0
}

export function match(a, b) {
  return (a.major === undefined || a.major === b.major)
    && (a.minor === undefined || a.minor === b.minor)
    && (a.patch === undefined || a.patch === b.patch)
    && ((a.tag === undefined && b.tag === undefined) || a.tag === b.tag)
    && (a.iteration === undefined || a.iteration === b.iteration)
    && (a.meta === undefined || a.meta === b.meta)
    && (a.build === undefined || a.build === b.build)
}

export function max(requested, versions, fallback) {
  const result = versions
    .map(parse)
    .filter(version => match(parse(requested), version))
    .sort(compare)

  if (result.length > 0) {
    return stringify(result.at(-1))
  } else {
    return fallback
  }
}
