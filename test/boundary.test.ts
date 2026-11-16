import { expect, test } from 'bun:test'
import { decodeReport, decodeSettings } from '../src/boundary.ts'
import type { JsonFinding, JsonReport } from '../src/report.generated.ts'

const FINDING: JsonFinding = {
  path: 'src/config.ts',
  firstLine: 12,
  lastLine: 31,
  trait: 'railway-not-guards',
  title: 'Railway, not guards',
  why: 'Guards hide how a value flows.',
  verdict: 'fail',
  pFail: 0.91,
  threshold: 0.5,
  failsCheck: true,
  fromCache: false,
}

const REPORT: JsonReport = {
  version: 1,
  root: '/work/repo',
  snippetCount: 2,
  failsCheck: true,
  findings: [FINDING],
  nonUtf8Paths: [],
}

test('the report from the contract doc decodes as it is', () => {
  expect(decodeReport(JSON.stringify(REPORT))).toEqual({ ok: true, value: REPORT })
})

test('fields the plugin does not know are ignored', () => {
  const decoded = decodeReport(
    JSON.stringify({ ...REPORT, extra: true, findings: [{ ...FINDING, extra: 1 }] }),
  )

  expect(decoded).toEqual({ ok: true, value: REPORT })
})

test('a missing threshold reads as null', () => {
  const { threshold: _threshold, ...withoutThreshold } = FINDING
  const decoded = decodeReport(JSON.stringify({ ...REPORT, findings: [withoutThreshold] }))

  expect(decoded).toEqual({
    ok: true,
    value: { ...REPORT, findings: [{ ...FINDING, threshold: null }] },
  })
})

test('a finding missing a required field fails the whole report', () => {
  const { trait: _trait, ...withoutTrait } = FINDING
  const decoded = decodeReport(JSON.stringify({ ...REPORT, findings: [withoutTrait] }))

  expect(decoded.ok).toBe(false)
})

test('an unknown verdict fails the whole report', () => {
  const decoded = decodeReport(
    JSON.stringify({ ...REPORT, findings: [{ ...FINDING, verdict: 'maybe' }] }),
  )

  expect(decoded.ok).toBe(false)
})

test('no settings means traitor defaults', () => {
  expect(decodeSettings({})).toEqual({
    ok: true,
    value: { command: undefined, base: undefined, files: [] },
  })
})

test('settings of the wrong shape are refused', () => {
  expect(decodeSettings({ traitor: { files: 'src/a.ts' } }).ok).toBe(false)
  expect(decodeSettings({ traitor: 'yes' }).ok).toBe(false)
})
