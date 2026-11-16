import { readFileSync } from 'node:fs'

const VENDORED = 'schema/check-report.schema.json'

const UPSTREAM =
  'https://raw.githubusercontent.com/jliocsar/traitor/main/schema/check-report.schema.json'

const upstream = await fetch(UPSTREAM)

if (!upstream.ok) {
  console.error(`could not fetch ${UPSTREAM}: ${upstream.status}`)
  process.exit(1)
}

const theirs = JSON.stringify(await upstream.json())
const ours = JSON.stringify(JSON.parse(readFileSync(VENDORED, 'utf8')))

if (theirs !== ours) {
  console.error(
    `${VENDORED} differs from traitor main. Copy it over, run \`bun run schema:types\`, and update the decoder in src/boundary.ts.`,
  )
  process.exit(1)
}

console.log(`${VENDORED} matches traitor main`)
