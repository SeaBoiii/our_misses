// Fails the build if the custom domain, manifest icons or a secret key went missing/leaked.
import { readFile, readdir } from 'node:fs/promises'
import assert from 'node:assert/strict'

const dist = new URL('../dist/', import.meta.url)
assert.equal((await readFile(new URL('CNAME', dist), 'utf8')).trim(), 'missu.aleemxnurul.love')
const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', dist), 'utf8'))
for (const icon of manifest.icons) await readFile(new URL(icon.src.slice(1), dist))
for (const file of await readdir(new URL('assets/', dist))) {
  if (!file.endsWith('.js')) continue
  const code = await readFile(new URL(`assets/${file}`, dist), 'utf8')
  assert.ok(!/sb_secret_|service_role/.test(code), `${file} contains a secret-looking key`)
}
console.log('Build checks passed: domain, icons, no secret keys.')
