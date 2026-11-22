// Fails the build if the custom domain or manifest icons went missing, or a secret key leaked
// into the bundle. Matches real keys only: supabase-js itself mentions the "sb_secret_" prefix.
import { readFile, readdir } from 'node:fs/promises'
import assert from 'node:assert/strict'

const dist = new URL('../dist/', import.meta.url)
assert.equal((await readFile(new URL('CNAME', dist), 'utf8')).trim(), 'missu.aleemxnurul.love')
const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', dist), 'utf8'))
for (const icon of manifest.icons) await readFile(new URL(icon.src.slice(1), dist))

const secretKey = /sb_secret_[A-Za-z0-9_-]{16,}/
const jwt = /eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g
for (const file of await readdir(new URL('assets/', dist))) {
  if (!file.endsWith('.js')) continue
  const code = await readFile(new URL(`assets/${file}`, dist), 'utf8')
  assert.ok(!secretKey.test(code), `${file} contains an sb_secret_ key`)
  for (const [, payload] of code.matchAll(jwt)) {
    let role
    try { role = JSON.parse(Buffer.from(payload, 'base64url').toString()).role } catch { continue }
    assert.notEqual(role, 'service_role', `${file} contains a service-role token`)
  }
}
console.log('Build checks passed: domain, icons, no secret keys.')
