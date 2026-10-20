# Releasing the Shiny extension

This guide describes the release process for the Shiny extension for VS Code and Positron.

## Before release: triage open issues and PRs

Review open issues and PRs for anything that should be addressed or closed out before
shipping. For each issue, decide whether it should be:

- **Fixed before release** if it's a user-facing bug with a small, safe fix.
- **Closed with a comment** if it's stale or no longer relevant.
- **Deferred** to a future release, leaving the issue open.

Triage PRs against their linked issues and close or defer accordingly.

## Pre-release checks

1. **Check for dependency vulnerabilities.**
   Look at the [Dependabot alerts](https://github.com/posit-dev/shiny-vscode/security/dependabot)
   and run `npm audit`. Address findings — especially critical or high severity ones —
   before tagging a release. Vulnerabilities that require dependency bumps should be
   fixed and merged *before* the release commit so they're included in the published
   version.

2. **Run the full test suite.**

   ```sh
   npm run check-types
   npm run lint
   npm test
   ```

3. **Review the CHANGELOG.** Make sure every user-facing change since the last release
   has an entry under `## UNRELEASED`, with the linked issue or PR number.

## Cutting the release

1. **Bump the version.** This updates both `package.json` and `package-lock.json`:

   ```sh
   npm version <version> --no-git-tag-version
   ```

2. **Rename `## UNRELEASED` to the new version** in `CHANGELOG.md`.

3. **Commit and tag.** Use the version number as the commit message:

   ```sh
   git add CHANGELOG.md package.json package-lock.json
   git commit -m "v<version>"
   git tag v<version>
   git push upstream main v<version>
   ```

Pushing the `v<version>` tag triggers the
[`publish.yml`](.github/workflows/publish.yml) workflow, which builds the VSIX and
publishes to both the VS Code Marketplace and Open VSX.

## After the workflow passes

1. **Create a GitHub Release** for the new tag with the release's CHANGELOG entries as
   the notes (and mark it as the latest release).

2. **Verify the published version** on the
   [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Posit.shiny)
   and [Open VSX](https://open-vsx.org/extension/posit/shiny).
