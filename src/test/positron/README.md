# Positron API Tests

Integration tests that run the Shiny extension inside a real
[Positron](https://positron.posit.co/) build and exercise its use of the
Positron API — code paths that the plain VS Code suite (`src/test/suite/`)
can't reach because they depend on Positron's extension host (the
`acquirePositronApi` global, the bundled `positron-run-app` extension, and
the Viewer pane).

Part of the rollout tracked in
[posit-dev/positron#14531](https://github.com/posit-dev/positron/issues/14531)
(pattern established in
[quarto-dev/quarto#1058](https://github.com/quarto-dev/quarto/pull/1058) and
[posit-dev/publisher#4298](https://github.com/posit-dev/publisher/pull/4298)).

## How it works

- `scripts/run-positron-tests.mjs` uses
  [`@posit-dev/positron-test-electron`](https://github.com/posit-dev/positron-test-electron)
  to download (and cache, under `.positron-test/`) a Positron build, then
  runs the compiled Mocha entry point (`out/test/positron/index.js`) inside
  its extension host — the Positron analog of `@vscode/test-electron`.
- `index.ts` is that entry point: it discovers `*.test.js` files in this
  directory and runs them with Mocha (tdd UI).
- Tests are compiled by `esbuild.ts` along with the plain suite (its `test`
  context already globs `src/test/**/*.ts`); the plain suite's runner
  (`src/test/suite/index.ts`) ignores `out/test/positron/` so `npm test`
  doesn't pick these up in vanilla VS Code.
- Positron's bundled extensions are left enabled (no `--disable-extensions`)
  because the run-app and Viewer tests exercise the bundled
  `positron-run-app` extension.

## Running locally

```bash
npm run test-positron                          # against the latest stable Positron
POSITRON_CHANNEL=daily npm run test-positron   # against a daily build
```

> **Note:** `@posit-dev/positron-test-electron` currently supports **macOS
> only**. On other platforms, rely on the `Positron API Tests` GitHub Actions
> workflow (`.github/workflows/positron-api-tests.yaml`), which runs on every
> PR and push to `main`.

## Adding tests

Add a `<name>.test.ts` file in this directory using Mocha's tdd UI
(`suite`/`test`). Things to know:

- The Positron API is reached through the `acquirePositronApi()` global that
  Positron injects into the extension host (typed by
  `src/types/positron.d.ts`). The extension's own code feature-detects
  Positron the same way — see `src/extension-api-utils/extensionHost.ts`.
- Prefer testing the extension's real behavior at the API boundary: import
  the extension source (e.g. `import { ... } from
  "../../extension-api-utils/extensionHost"`) and assert on what it sends to
  / receives from the live API, rather than poking the API directly.
- Keep tests independent of a live kernel actually starting whenever
  possible — metadata-level assertions (e.g.
  `positron.runtime.getPreferredRuntime`) are much faster and less flaky
  than starting an R/Python session. If you do need runtime discovery (e.g.
  to test `getRPathFromPositron` in `src/run.ts`), the CI runner will also
  need R/Python installed, and the test should poll until Positron reports a
  runtime before asserting.
