#!/usr/bin/env node
/**
 * Report whether an app matches the Grafana OTLP contract.
 * Prints booleans, lengths, and file paths. Never prints secret values.
 *
 *   node audit-otel.mjs <app-root> [<app-root>...]
 */
import fs from 'node:fs'
import path from 'node:path'

const IGNORE_DIRS = new Set([
  'node_modules', 'bin', 'obj', 'dist', '.git', 'graphify-out', '.vite',
  'coverage', 'harness', '.next', 'build', 'out',
])

const roots = process.argv.slice(2).map((root) => path.resolve(root))
if (roots.length === 0) {
  console.error('usage: node audit-otel.mjs <app-root> [<app-root>...]')
  process.exit(2)
}

for (const root of roots) {
  if (!fs.existsSync(root)) {
    console.log(`ROOT ${root}`)
    console.log('missing=true')
    continue
  }
  audit(root)
}

function audit(root) {
  const files = []
  walk(root, files, 0)
  const textFiles = files.filter(isTextSource)
  const blobs = textFiles.map((file) => ({ file, text: readText(file) }))
  const packageJson = readJson(path.join(root, 'package.json'))
  const deps = {
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {}),
  }

  const dotnet = files.some((file) => file.endsWith('.csproj'))
  const nest = Boolean(deps['@nestjs/core'] || fs.existsSync(path.join(root, 'nest-cli.json')))
  const react = Boolean(deps.react)
  const vite = Boolean(deps.vite || files.some((file) => path.basename(file).startsWith('vite.config.')))
  const next = Boolean(deps.next)

  console.log(`ROOT ${root}`)
  console.log(`stack dotnet=${dotnet} nest=${nest} react=${react} vite=${vite} next=${next}`)

  const has = (pattern) => blobs.some(({ text }) => pattern.test(text))
  const hit = (pattern) => blobs.find(({ text }) => pattern.test(text))?.file

  if (dotnet) {
    console.log(`dotnet useOtlpExporter=${has(/UseOtlpExporter\s*\(/)}`)
    console.log(`dotnet otlpRoute=${has(/\/otlp\/v1/)}`)
    console.log(`dotnet readsEndpointEnv=${has(/OTEL_EXPORTER_OTLP_ENDPOINT/)}`)
    console.log(`dotnet dropsOtlpSpans=${has(/\/otlp/)}`)
  }
  if (nest) {
    console.log(`nest sdk=${has(/@opentelemetry\/sdk-node/)}`)
    console.log(`nest otlpRoute=${has(/\/otlp\/v1/)}`)
    console.log(`nest rawBody=${has(/express\.raw|bodyParser:\s*false|rawBody:\s*true/)}`)
    console.log(`nest importedBeforeFactory=${nestImportsOtelFirst(blobs)}`)
  }
  if (react) {
    console.log(`react viteFlag=${has(/VITE_OTEL_ENABLED/)}`)
    console.log(`react signalPath=${has(/\/v1\/traces/)}`)
    console.log(`react ignoresOtlpFetch=${has(/ignoreUrls[\s\S]{0,80}\/otlp/)}`)
    console.log(`react proxy=${has(/createOtlpProxy|['"]\/otlp['"]/)}`)
    console.log(`react initGuard=${has(/otelEnabled|VITE_OTEL_ENABLED !== ['"]true['"]|!== 'true'/)}`)
  }

  const secretHits = blobs
    .filter(({ file }) => !path.basename(file).startsWith('.env'))
    .filter(({ text }) => /glc_[A-Za-z0-9._\-]+|Authorization=Basic(?:%20|\s+)[A-Za-z0-9+/=]{20,}/.test(text))
    .map(({ file }) => path.relative(root, file))
  console.log(`sourceSecretHits=${secretHits.length ? secretHits.join(',') : 'none'}`)

  console.log(`gitignoreDotenv=${gitignoreCoversDotenv(root)}`)

  for (const name of ['.env', '.env.local', '.env.development', '.env.example', '.env.sample']) {
    const envPath = path.join(root, name)
    if (!fs.existsSync(envPath)) continue
    reportEnv(name, readText(envPath), name.includes('example') || name.includes('sample'))
  }
  console.log('')
}

function reportEnv(name, raw, example) {
  const map = parseEnv(raw)
  const keys = [
    'OTEL_EXPORTER_OTLP_PROTOCOL',
    'OTEL_EXPORTER_OTLP_ENDPOINT',
    'OTEL_EXPORTER_OTLP_HEADERS',
    'OTEL_SERVICE_NAME',
    'OTEL_RESOURCE_ATTRIBUTES',
    'VITE_OTEL_ENABLED',
    'VITE_API_BASE_URL',
    'API_PROXY_TARGET',
  ]
  console.log(`envFile ${name} example=${example}`)
  for (const key of keys) {
    if (!Object.hasOwn(map, key)) continue
    const parsed = map[key]
    if (example) {
      console.log(`  ${key} present=${parsed.value.length > 0 ? 'nonempty' : 'empty'} quoted=${parsed.quoted}`)
      continue
    }
    if (key === 'OTEL_EXPORTER_OTLP_HEADERS') {
      reportHeader(parsed)
      continue
    }
    if (key === 'OTEL_EXPORTER_OTLP_ENDPOINT') {
      const value = parsed.value
      console.log(`  endpoint len=${value.length} quoted=${parsed.quoted} https=${value.startsWith('https://')} endsWithOtlp=${/\/otlp\/?$/.test(value)} hasSignalPath=${value.includes('/v1/')}`)
      continue
    }
    if (key === 'VITE_OTEL_ENABLED') {
      console.log(`  viteFlag exactTrue=${parsed.value === 'true'} quoted=${parsed.quoted}`)
      continue
    }
    console.log(`  ${key} len=${parsed.value.length} quoted=${parsed.quoted}`)
  }
  const leaked = Object.keys(map).filter((key) => key.startsWith('VITE_') && /authorization|basic%20|glc_/i.test(map[key].value))
  if (leaked.length) console.log(`  secretInViteKeys=${leaked.join(',')}`)
}

function reportHeader(parsed) {
  const value = parsed.value
  const pct = value.startsWith('Authorization=Basic%20')
  const space = value.startsWith('Authorization=Basic ')
  let token = ''
  if (pct) token = value.slice('Authorization=Basic%20'.length)
  else if (space) token = value.slice('Authorization=Basic '.length)
  let decoded = 'absent'
  const wellFormed = /^[A-Za-z0-9+/]+={0,2}$/.test(token) && token.length % 4 === 0
  if (token && !wellFormed) {
    decoded = 'invalid'
  } else if (token) {
    const bytes = Buffer.from(token, 'base64')
    const text = bytes.toString('utf8')
    const roundTrip = bytes.toString('base64').replace(/=+$/, '') === token.replace(/=+$/, '')
    const [instance, secret] = text.split(':')
    decoded = `ok=${roundTrip && text.includes(':')} instanceDigits=${/^\d+$/.test(instance ?? '')} keyStartsGlc=${(secret ?? '').startsWith('glc_')} keyLen=${(secret ?? '').length}`
  }
  console.log(`  header len=${value.length} quoted=${parsed.quoted} authPrefix=${value.startsWith('Authorization=')} pct20=${pct} spaceBasic=${space} tokenLen=${token.length} ${decoded}`)
}

function parseEnv(raw) {
  const map = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    const rawValue = trimmed.slice(eq + 1).trim()
    const quoted = (rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"))
    const value = quoted ? rawValue.slice(1, -1) : rawValue
    map[key] = { value, quoted }
  }
  return map
}

function nestImportsOtelFirst(blobs) {
  const main = blobs.find(({ file }) => /[/\\]main\.ts$/.test(file))
  if (!main) return false
  const imports = [...main.text.matchAll(/^import\s+['"]([^'"]+)['"]/gm)].map((match) => match[1])
  const factory = main.text.search(/NestFactory\.create/)
  const otelImportAt = main.text.search(/import\s+['"][^'"]*otel[^'"]*['"]/)
  return imports.some((item) => item.includes('otel')) && (factory === -1 || (otelImportAt !== -1 && otelImportAt < factory))
}

function walk(dir, acc, depth) {
  if (depth > 8) return
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc, depth + 1)
    else acc.push(full)
  }
}

function isTextSource(file) {
  return /\.(cs|csproj|ts|tsx|js|mjs|json|yml|yaml|env|example|md)$/.test(file)
}

function gitignoreCoversDotenv(start) {
  let dir = start
  for (let i = 0; i < 6; i++) {
    const file = path.join(dir, '.gitignore')
    if (fs.existsSync(file) && readText(file).includes('.env')) return true
    if (fs.existsSync(path.join(dir, '.git'))) return false
    const parent = path.dirname(dir)
    if (parent === dir) return false
    dir = parent
  }
  return false
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}
