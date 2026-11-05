import { build } from 'esbuild'
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const actions = [
  { entry: 'src/index.ts', outdir: 'dist/create' },
  { entry: 'src/get-index.ts', outdir: 'dist/get' },
]

// Bundled CommonJS dependencies (undici) call require() on Node built-ins,
// which an ESM bundle does not provide on its own.
const banner = [
  "import { createRequire as __createRequire } from 'node:module';",
  'const require = __createRequire(import.meta.url);',
  'process.setSourceMapsEnabled(true);',
].join('\n')

for (const { entry, outdir } of actions) {
  rmSync(outdir, { recursive: true, force: true })

  const { metafile } = await build({
    entryPoints: [entry],
    outfile: join(outdir, 'index.js'),
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    sourcemap: true,
    legalComments: 'none',
    banner: { js: banner },
    metafile: true,
    logLevel: 'warning',
  })

  writeFileSync(join(outdir, 'licenses.txt'), licensesFor(Object.keys(metafile.inputs)))
}

function licensesFor(inputPaths) {
  const packageDirs = new Set(inputPaths.map(packageDirOf).filter(Boolean))
  return [...packageDirs]
    .map(describePackage)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, version, license, text }) => `${name}@${version}\n${license}\n${text}`.trimEnd())
    .join('\n\n')
    .concat('\n')
}

function packageDirOf(inputPath) {
  const marker = 'node_modules/'
  const start = inputPath.lastIndexOf(marker)
  if (start === -1) return null
  const segments = inputPath.slice(start + marker.length).split('/')
  const nameLength = segments[0].startsWith('@') ? 2 : 1
  return inputPath.slice(0, start + marker.length) + segments.slice(0, nameLength).join('/')
}

function describePackage(dir) {
  const { name, version, license } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const licenseFile = readdirSync(dir).find((file) => /^(licen[cs]e|copying)/i.test(file))
  const text = licenseFile ? readFileSync(join(dir, licenseFile), 'utf8') : ''
  return { name, version, license: license ?? 'UNKNOWN', text }
}
