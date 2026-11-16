import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Decoded, TraitorSettings } from './boundary.ts'
import { decodeReport } from './boundary.ts'
import type { JsonReport } from './report.generated.ts'

const PATH_COMMAND = 'traitor'
const LOCAL_COMMAND = ['node_modules', '.bin', 'traitor']
const CHECK_ARGUMENTS = ['check', '--format', 'json']
const FILES_FLAG = '--files'
const REPORTING_EXIT_CODES = new Set([0, 1])
const MAXIMUM_OUTPUT_BYTES = 256 * 1024 * 1024
const RUNS = new Map<string, Decoded<JsonReport>>()

function commandFor(settings: TraitorSettings, cwd: string): string {
  if (settings.command !== undefined) {
    return settings.command
  }

  const local = join(cwd, ...LOCAL_COMMAND)

  return existsSync(local) ? local : PATH_COMMAND
}

function argumentsFor(settings: TraitorSettings): readonly string[] {
  if (settings.files.length > 0) {
    return [...CHECK_ARGUMENTS, FILES_FLAG, ...settings.files]
  }

  return settings.base === undefined ? CHECK_ARGUMENTS : [...CHECK_ARGUMENTS, settings.base]
}

function runOnce(settings: TraitorSettings, cwd: string): Decoded<JsonReport> {
  const command = commandFor(settings, cwd)

  const result = spawnSync(command, argumentsFor(settings), {
    cwd,
    encoding: 'utf8',
    maxBuffer: MAXIMUM_OUTPUT_BYTES,
  })

  if (result.error !== undefined) {
    return { ok: false, problem: `\`${command}\` could not start: ${result.error.message}` }
  }

  if (result.status === null || !REPORTING_EXIT_CODES.has(result.status)) {
    const reason = result.stderr.trim()
    const exit =
      result.status === null ? `signal ${String(result.signal)}` : `code ${result.status}`

    return {
      ok: false,
      problem: `it exited with ${exit}: ${reason.length > 0 ? reason : 'no reason given'}`,
    }
  }

  return decodeReport(result.stdout)
}

export function runKey(settings: TraitorSettings, cwd: string): string {
  return JSON.stringify([cwd, settings.command, settings.base, settings.files])
}

export function traitorReport(settings: TraitorSettings, cwd: string): Decoded<JsonReport> {
  const key = runKey(settings, cwd)
  const cached = RUNS.get(key)

  if (cached !== undefined) {
    return cached
  }

  const outcome = runOnce(settings, cwd)

  RUNS.set(key, outcome)

  return outcome
}
