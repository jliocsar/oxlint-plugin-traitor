import type { Context, Rule } from '@oxlint/plugins'
import { defineRule } from '@oxlint/plugins'
import type { Decoded } from './boundary.ts'
import { decodeSettings } from './boundary.ts'
import type { Diagnostic, Tier } from './findings.ts'
import { diagnosticsFor } from './findings.ts'
import type { JsonReport } from './report.generated.ts'
import { runKey, traitorReport } from './run.ts'

const SETTINGS_PROBLEM_KEY = 'settings'
const FIRST_LINE = 1
const REPORTED_PROBLEMS = new Set<string>()

const MESSAGES = {
  failsCheck:
    '{{title}}: {{why}} Trait `{{trait}}` fails this snippet (pFail {{pFail}}, threshold {{threshold}}).',
  leansFail:
    '{{title}}: {{why}} Trait `{{trait}}` leans fail here (pFail {{pFail}}) but stays under its threshold of {{threshold}}. Worth a look.',
  reportOnly:
    '{{title}}: {{why}} Trait `{{trait}}` fails this snippet (pFail {{pFail}}). It has no threshold, so it only reports.',
  unsure:
    '{{title}}: {{why}} Jev could not tell from this snippet alone whether it holds trait `{{trait}}`. A person should read it.',
  traitorFailed: 'traitor could not check this run, so no trait was judged: {{problem}}.',
}

const DESCRIPTIONS = {
  fail: 'report traitor findings that fail their trait threshold',
  review: 'report traitor findings that lean fail under their threshold, or that Jev was unsure of',
}

function reportProblemOnce(context: Context, key: string, problem: string) {
  if (REPORTED_PROBLEMS.has(key)) {
    return
  }

  REPORTED_PROBLEMS.add(key)
  context.report({
    loc: { start: { line: FIRST_LINE, column: 0 }, end: { line: FIRST_LINE, column: 0 } },
    messageId: 'traitorFailed',
    data: { problem },
  })
}

function reportDiagnostic(context: Context, { messageId, finding }: Diagnostic) {
  const { lines } = context.sourceCode
  const lastLine = Math.min(Math.max(finding.lastLine, finding.firstLine), lines.length)
  const firstLine = Math.min(finding.firstLine, lastLine)

  context.report({
    loc: {
      start: { line: firstLine, column: 0 },
      end: { line: lastLine, column: lines[lastLine - 1]?.length ?? 0 },
    },
    messageId,
    data: {
      title: finding.title,
      why: finding.why,
      trait: finding.trait,
      pFail: finding.pFail.toFixed(2),
      threshold: finding.threshold?.toFixed(2) ?? 'none',
    },
  })
}

function reportFor(context: Context): Decoded<JsonReport> & { readonly key: string } {
  const settings = decodeSettings(context.settings)

  if (!settings.ok) {
    return { ...settings, key: SETTINGS_PROBLEM_KEY }
  }

  return {
    ...traitorReport(settings.value, context.cwd),
    key: runKey(settings.value, context.cwd),
  }
}

export function traitorRule(tier: Tier): Rule {
  return defineRule({
    meta: {
      type: 'problem',
      docs: { description: DESCRIPTIONS[tier] },
      messages: MESSAGES,
    },
    create(context) {
      return {
        Program() {
          const outcome = reportFor(context)

          if (!outcome.ok) {
            reportProblemOnce(context, outcome.key, outcome.problem)

            return
          }

          for (const diagnostic of diagnosticsFor(outcome.value, context.filename, tier)) {
            reportDiagnostic(context, diagnostic)
          }
        },
      }
    },
  })
}
