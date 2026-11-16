import { expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

type Diagnostic = {
  readonly file: string
  readonly line: number
  readonly rule: string
  readonly message: string
}

type LintRun = {
  readonly scenario: string
  readonly files: readonly string[]
  readonly traitor: Readonly<Record<string, string | readonly string[]>>
}

const OXLINT = ['bunx', '--bun', 'oxlint']
const STUB = `${import.meta.dir}/stub/traitor.ts`
const SCENARIOS = `${import.meta.dir}/scenarios`
const CONFIGS = `${import.meta.dir}/tmp`
const CONFIG = 'test/fixtures/config.ts'
const OTHER = 'test/fixtures/other.ts'
const BOTH_RULES = { 'traitor/fail': 'error', 'traitor/review': 'warn' }

const UNIX_REPORT_LINE =
  /^(?<file>[^:]+):(?<line>\d+):\d+: (?<message>.*) \[(?:Error|Warning)\/(?<rule>[^\]]+)\]$/u

async function lint(run: LintRun): Promise<{ diagnostics: Diagnostic[]; invocations: string[] }> {
  const runId = randomUUID()
  const configPath = `${CONFIGS}/oxlint-${runId}.json`
  const logPath = `${CONFIGS}/traitor-${runId}.log`

  await Bun.write(logPath, '')
  await Bun.write(
    configPath,
    JSON.stringify({
      jsPlugins: ['../../src/index.ts'],
      settings: { traitor: { command: STUB, ...run.traitor } },
      rules: BOTH_RULES,
    }),
  )

  const result = await Bun.$`${OXLINT} -c ${configPath} -f unix ${run.files}`
    .env({
      ...process.env,
      TRAITOR_STUB_SCENARIO: `${SCENARIOS}/${run.scenario}.json`,
      TRAITOR_STUB_LOG: logPath,
    })
    .nothrow()
    .quiet()

  const diagnostics = result.stdout
    .toString()
    .split('\n')
    .flatMap((reportLine) => {
      const groups = UNIX_REPORT_LINE.exec(reportLine)?.groups

      return groups === undefined
        ? []
        : [
            {
              file: groups['file'] ?? '',
              line: Number(groups['line']),
              rule: groups['rule'] ?? '',
              message: groups['message'] ?? '',
            },
          ]
    })

  const invocations = readFileSync(logPath, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)

  return { diagnostics, invocations }
}

function linesOf(diagnostics: Diagnostic[], file: string, rule: string): number[] {
  return diagnostics
    .filter((diagnostic) => diagnostic.file === file && diagnostic.rule === rule)
    .map((diagnostic) => diagnostic.line)
    .sort((left, right) => left - right)
}

test('fail reports the findings that fail their threshold, on their own lines', async () => {
  const { diagnostics } = await lint({ scenario: 'mixed', files: [CONFIG, OTHER], traitor: {} })

  expect(linesOf(diagnostics, CONFIG, 'traitor(fail)')).toEqual([3])
  expect(linesOf(diagnostics, OTHER, 'traitor(fail)')).toEqual([1])
})

test('review reports fails under the threshold, report-only fails and unsure verdicts', async () => {
  const { diagnostics } = await lint({ scenario: 'mixed', files: [CONFIG, OTHER], traitor: {} })

  expect(linesOf(diagnostics, CONFIG, 'traitor(review)')).toEqual([7, 10, 17])
  expect(linesOf(diagnostics, OTHER, 'traitor(review)')).toEqual([])
})

test('messages name the trait and say why it matters', async () => {
  const { diagnostics } = await lint({ scenario: 'mixed', files: [CONFIG], traitor: {} })
  const messages = diagnostics.map((diagnostic) => diagnostic.message)

  expect(messages).toContain(
    'Railway, not guards: Guards hide how a value flows. Trait `railway-not-guards` fails this snippet (pFail 0.91, threshold 0.50).',
  )
  expect(messages.filter((message) => message.includes('{{'))).toEqual([])
})

test('traitor runs once per lint run, whatever the number of files and rules', async () => {
  const { invocations } = await lint({ scenario: 'mixed', files: [CONFIG, OTHER], traitor: {} })

  expect(invocations).toEqual(['check --format json'])
})

test('base is passed as the revision to check against', async () => {
  const { invocations } = await lint({
    scenario: 'clean',
    files: [CONFIG],
    traitor: { base: 'origin/main' },
  })

  expect(invocations).toEqual(['check --format json origin/main'])
})

test('files are passed through --files', async () => {
  const { invocations } = await lint({
    scenario: 'clean',
    files: [CONFIG],
    traitor: { files: ['src/a.ts', 'src/b.ts'] },
  })

  expect(invocations).toEqual(['check --format json --files src/a.ts src/b.ts'])
})

test('a traitor that cannot run is reported once, with its reason', async () => {
  const { diagnostics } = await lint({
    scenario: 'cannot-run',
    files: [CONFIG, OTHER],
    traitor: {},
  })

  expect(diagnostics).toHaveLength(1)
  expect(diagnostics[0]?.message).toContain('it exited with code 2: TYPESAFE_API_KEY is not set')
})

test('a report version this plugin was not written for is refused', async () => {
  const { diagnostics } = await lint({ scenario: 'next-version', files: [CONFIG], traitor: {} })

  expect(diagnostics).toHaveLength(1)
  expect(diagnostics[0]?.message).toContain('it sent report version 2')
})

test('output that is not JSON is refused', async () => {
  const { diagnostics } = await lint({ scenario: 'not-json', files: [CONFIG], traitor: {} })

  expect(diagnostics).toHaveLength(1)
  expect(diagnostics[0]?.message).toContain('its output is not JSON')
})

test('a command that does not exist is reported', async () => {
  const { diagnostics } = await lint({
    scenario: 'clean',
    files: [CONFIG],
    traitor: { command: '/nonexistent/traitor' },
  })

  expect(diagnostics).toHaveLength(1)
  expect(diagnostics[0]?.message).toContain('`/nonexistent/traitor` could not start')
})

test('base and files together are refused, as traitor refuses them', async () => {
  const { diagnostics, invocations } = await lint({
    scenario: 'clean',
    files: [CONFIG],
    traitor: { base: 'origin/main', files: ['src/a.ts'] },
  })

  expect(invocations).toEqual([])
  expect(diagnostics).toHaveLength(1)
  expect(diagnostics[0]?.message).toContain('takes `base` or `files`, not both')
})

test('a clean report reports nothing', async () => {
  const { diagnostics } = await lint({ scenario: 'clean', files: [CONFIG, OTHER], traitor: {} })

  expect(diagnostics).toEqual([])
})
