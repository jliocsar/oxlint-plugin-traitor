import type { JsonFinding, JsonReport } from './report.generated.ts'

export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject

export type JsonObject = { readonly [key: string]: JsonValue }

export type Decoded<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly problem: string }

export type TraitorSettings = {
  readonly command: string | undefined
  readonly base: string | undefined
  readonly files: readonly string[]
}

type Verdict = JsonFinding['verdict']

type Present<Shape> = { readonly [Key in keyof Shape]-?: Shape[Key] | undefined }

const SUPPORTED_VERSION = 1
const SETTINGS_KEY = 'traitor'
const VERDICTS: readonly Verdict[] = ['pass', 'fail', 'n/a', 'unsure']
const NO_SETTINGS: TraitorSettings = { command: undefined, base: undefined, files: [] }

function succeed<Value>(value: Value): Decoded<Value> {
  return { ok: true, value }
}

function refuse<Value>(problem: string): Decoded<Value> {
  return { ok: false, problem }
}

function asObject(value: JsonValue | undefined): JsonObject | undefined {
  if (value === null || value === undefined || Array.isArray(value)) {
    return undefined
  }

  return typeof value === 'object' ? value : undefined
}

function asArray(value: JsonValue | undefined): readonly JsonValue[] | undefined {
  return Array.isArray(value) ? value : undefined
}

function asString(value: JsonValue | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asNumber(value: JsonValue | undefined): number | undefined {
  return typeof value === 'number' ? value : undefined
}

function asInteger(value: JsonValue | undefined): number | undefined {
  const number = asNumber(value)

  return number !== undefined && Number.isInteger(number) ? number : undefined
}

function asBoolean(value: JsonValue | undefined): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function asVerdict(value: JsonValue | undefined): Verdict | undefined {
  return VERDICTS.find((verdict) => verdict === value)
}

function asStrings(value: JsonValue | undefined): readonly string[] | undefined {
  const strings = asArray(value)?.flatMap((item) => {
    const text = asString(item)

    return text === undefined ? [] : [text]
  })

  return strings?.length === asArray(value)?.length ? strings : undefined
}

function complete<Shape>(fields: Present<Shape>): Shape | undefined {
  if (Object.values(fields).some((field) => field === undefined)) {
    return undefined
  }

  // SAFETY: every field was just checked to be defined, and being possibly undefined is all Present adds to Shape
  return fields as Shape
}

function parseJson(text: string): Decoded<JsonValue> {
  try {
    // SAFETY: JSON.parse only ever builds JSON values; its `any` return is a typing gap, not a wider range
    return succeed(JSON.parse(text) as JsonValue)
  } catch (cause) {
    return refuse(`its output is not JSON (${String(cause)})`)
  }
}

function decodeThreshold(value: JsonValue | undefined): number | null | undefined {
  return value === null ? null : asNumber(value)
}

function decodeFinding(value: JsonValue): JsonFinding | undefined {
  const finding = asObject(value)

  if (finding === undefined) {
    return undefined
  }

  const threshold = decodeThreshold(finding['threshold'])
  const thresholdIsValid = finding['threshold'] === undefined || threshold !== undefined

  const fields = complete<Omit<JsonFinding, 'threshold'>>({
    path: asString(finding['path']),
    firstLine: asInteger(finding['firstLine']),
    lastLine: asInteger(finding['lastLine']),
    trait: asString(finding['trait']),
    title: asString(finding['title']),
    why: asString(finding['why']),
    verdict: asVerdict(finding['verdict']),
    pFail: asNumber(finding['pFail']),
    failsCheck: asBoolean(finding['failsCheck']),
    fromCache: asBoolean(finding['fromCache']),
  })

  if (fields === undefined || !thresholdIsValid) {
    return undefined
  }

  return { ...fields, threshold: threshold ?? null }
}

function decodeFindings(value: JsonValue | undefined): readonly JsonFinding[] | undefined {
  const items = asArray(value)
  const findings = items?.flatMap((item) => {
    const finding = decodeFinding(item)

    return finding === undefined ? [] : [finding]
  })

  return findings?.length === items?.length ? findings : undefined
}

export function decodeReport(text: string): Decoded<JsonReport> {
  const parsed = parseJson(text)

  if (!parsed.ok) {
    return parsed
  }

  const report = asObject(parsed.value)
  const version = asInteger(report?.['version'])

  if (version !== SUPPORTED_VERSION) {
    return refuse(
      `it sent report version ${String(version)}, and this plugin reads version ${SUPPORTED_VERSION}. Upgrade @jliocsar/oxlint-plugin-traitor`,
    )
  }

  const findings = decodeFindings(report?.['findings'])
  const nonUtf8Paths = asStrings(report?.['nonUtf8Paths'])

  const decoded = complete<JsonReport>({
    version,
    root: asString(report?.['root']),
    snippetCount: asInteger(report?.['snippetCount']),
    failsCheck: asBoolean(report?.['failsCheck']),
    findings: findings === undefined ? undefined : [...findings],
    nonUtf8Paths: nonUtf8Paths === undefined ? undefined : [...nonUtf8Paths],
  })

  return decoded === undefined
    ? refuse('its report does not match the version 1 contract')
    : succeed(decoded)
}

export function decodeSettings(settings: JsonObject): Decoded<TraitorSettings> {
  const raw = settings[SETTINGS_KEY]

  if (raw === undefined) {
    return succeed(NO_SETTINGS)
  }

  const traitor = asObject(raw)
  const command = traitor?.['command']
  const base = traitor?.['base']
  const files = traitor?.['files'] === undefined ? [] : asStrings(traitor['files'])

  if (
    traitor === undefined ||
    (command !== undefined && asString(command) === undefined) ||
    (base !== undefined && asString(base) === undefined) ||
    files === undefined
  ) {
    return refuse(
      '`settings.traitor` takes `command` (a path), `base` (a revision) and `files` (a list of paths)',
    )
  }

  if (base !== undefined && files.length > 0) {
    return refuse('`settings.traitor` takes `base` or `files`, not both, as traitor does')
  }

  return succeed({ command: asString(command), base: asString(base), files })
}
