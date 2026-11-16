import { resolve } from 'node:path'
import type { JsonFinding, JsonReport } from './report.generated.ts'

export type Tier = 'fail' | 'review'

export type Diagnostic = {
  readonly messageId: 'failsCheck' | 'leansFail' | 'reportOnly' | 'unsure'
  readonly finding: JsonFinding
}

const FAIL = 'fail'
const UNSURE = 'unsure'

function diagnosticFor(tier: Tier, finding: JsonFinding): Diagnostic | undefined {
  if (finding.failsCheck) {
    return tier === FAIL ? { messageId: 'failsCheck', finding } : undefined
  }

  if (tier === FAIL) {
    return undefined
  }

  if (finding.verdict === UNSURE) {
    return { messageId: 'unsure', finding }
  }

  if (finding.verdict !== FAIL) {
    return undefined
  }

  return { messageId: (finding.threshold ?? null) === null ? 'reportOnly' : 'leansFail', finding }
}

export function diagnosticsFor(
  report: JsonReport,
  filename: string,
  tier: Tier,
): readonly Diagnostic[] {
  const file = resolve(filename)

  return report.findings.flatMap((finding) => {
    const diagnostic =
      resolve(report.root, finding.path) === file ? diagnosticFor(tier, finding) : undefined

    return diagnostic === undefined ? [] : [diagnostic]
  })
}
