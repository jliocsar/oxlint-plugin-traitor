#!/usr/bin/env bun
import { appendFileSync, readFileSync } from 'node:fs'

const scenarioPath = process.env['TRAITOR_STUB_SCENARIO'] ?? ''
const logPath = process.env['TRAITOR_STUB_LOG'] ?? ''
const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8'))

appendFileSync(logPath, `${process.argv.slice(2).join(' ')}\n`)

if (scenario.stderr !== undefined) {
  process.stderr.write(scenario.stderr)
}

if (scenario.stdout !== undefined) {
  process.stdout.write(scenario.stdout)
}

if (scenario.report !== undefined) {
  process.stdout.write(`${JSON.stringify({ ...scenario.report, root: process.cwd() })}\n`)
}

process.exit(scenario.exitCode)
