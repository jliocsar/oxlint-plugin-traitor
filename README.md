# @jliocsar/oxlint-plugin-traitor

Runs [traitor](https://github.com/jliocsar/traitor) once per oxlint run and reports its findings as oxlint diagnostics, on the lines of the snippet each one is about.

traitor knows nothing about oxlint. This plugin reads its `check --format json` report (contract version 1) and nothing else.

## Install

```sh
bun add -D oxlint @jliocsar/traitor @jliocsar/oxlint-plugin-traitor
```

```json
{
  "extends": ["./node_modules/@jliocsar/oxlint-plugin-traitor/preset.json"],
  "jsPlugins": ["@jliocsar/oxlint-plugin-traitor"]
}
```

traitor needs `TYPESAFE_API_KEY` in the environment, as it does on its own.

## Rules

| Rule             | Preset | Reports                                                                                                                     |
| ---------------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| `traitor/fail`   | error  | Findings with `failsCheck: true`: pFail reached the trait's threshold. These are the ones that make `traitor check` exit 1. |
| `traitor/review` | warn   | Findings that lean `fail` but stay under the threshold, `fail` verdicts of traits with no threshold, and `unsure` verdicts. |

They're two rules because oxlint sets severity per rule, not per diagnostic. Passes and `n/a` verdicts report nothing.

## What it checks

One `traitor check --format json` runs per oxlint run, the first time a file is linted. Every file and both rules read that one report. A file traitor didn't judge gets nothing.

By default traitor judges what you haven't pushed, as plain `traitor check` does. Change that in `settings.traitor`:

```json
{
  "settings": {
    "traitor": {
      "base": "origin/main"
    }
  }
}
```

| Setting   | Default                                             | Meaning                                                                                     |
| --------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `base`    | none                                                | A revision. traitor judges what changed since it. Use it in CI.                             |
| `files`   | none                                                | Paths traitor judges whole, as they are on disk (`--files`). Can't be combined with `base`. |
| `command` | `node_modules/.bin/traitor`, then `traitor` on PATH | The traitor binary to run.                                                                  |

The files oxlint lints don't choose what traitor judges. A rule sees one file at a time and can't wait for the end of the run, so the plugin can't hand oxlint's file list to `--files`.

When traitor can't run (no API key, not a git repository, a report version this plugin doesn't read), the first linted file gets one diagnostic that says why, and no trait is judged.

## CLI and CI only

Keep this plugin out of your editor. The editor's oxlint stays running, so the cached report goes stale, and checking on every save costs Jev calls. Run it from the command line, in CI, from a pre-push hook, or from an agent's Stop hook.

One way is a separate config that only CI and hooks use:

```sh
oxlint -c .oxlintrc.traitor.json
```

## The contract

`schema/check-report.schema.json` is a copy of traitor's. `src/report.generated.ts` is generated from it (`bun run schema:types`), and `src/boundary.ts` decodes traitor's output into those types and refuses any version but 1. CI fails when the copy drifts from traitor main.

## License

MIT
