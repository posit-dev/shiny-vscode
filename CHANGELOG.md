# Change Log

New `shiny.timeout` option to increase default timeout.

## 1.1.0

- In Positron, the extension now uses the selected R runtime for Shiny for R apps. In VS Code, the extension also now consults the `r.rpath.mac`, `r.rpath.windows` or `r.rpath.linux` settings to find the R executable, before falling back to system settings. These settings are part of the [R Debugger extension](https://marketplace.visualstudio.com/items?itemName=RDebugger.r-debugger) ([#64](https://github.com/posit-dev/shiny-vscode/pull/64))

- Improved feedback when waiting for a slow Shiny app to start up. ([#65](https://github.com/posit-dev/shiny-vscode/pull/65))

- The "Run Shiny app" command now saves the active file before running the app. ([#68](https://github.com/posit-dev/shiny-vscode/pull/68))

- `shiny.previewType` now explicitly includes `"internal"` and `"simple browser"` as distinct options, where `"simple browser"` ensures that the built-in Simple Browser extension is used for previews. In Positron, `"internal"` uses the Viewer pane; in other VS Code instances `"internal"` and `"simple browser"` are equivalent. ([#69](https://github.com/posit-dev/shiny-vscode/pull/69))

- The extension can now open Shinylive apps locally from `vscode://posit.shiny/shinylive?url=...` links. ([#70](https://github.com/posit-dev/shiny-vscode/pull/70))

## 1.0.0

The Shiny extension for VS Code now has a new extension ID: `Posit.shiny`! New Shiny users should install the Shiny extension from [the VS Code marketplace](https://marketplace.visualstudio.com/items?itemName=Posit.shiny) or [https://open-vsx.org/extension/posit/shiny](https://open-vsx.org/extension/posit/shiny).

If you previously used the old extension with ID `Posit.shiny-python`, upgrading to the latest version will automatically install the new extension and uninstall the outdated version.

## 0.2.0

- The extension now supports Shiny for R apps. (#30)
- The [Python VS Code extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python) is now a soft dependency and is no longer installed by default with the Shiny for VS Code extension. (#30)
- Added a new setting, `shiny.previewType`, to control where the Shiny app preview should be opened. (#40)
- Added a new `shinyexpress` snippet to quickly create a basic Shiny Express app in Python. (#42)
- The extension now correctly escapes commands on PowerShell 7 where the binary is named `pwsh.exe`. (#48)
- The extension can now create Shinylive links or save apps from Shinylive links (#44):
  - **Create ShinyLive Link from Active File** creates a Shinylive link from the active file (Command Palette).
  - **Create ShinyLive Link from Selected Files** creates a Shinylive link from the selected files or directories in the right-click context menu of the File Explorer.
  - **Save App from Shinylive Link** saves an app and its files from a Shinylive link (Command Palette).
- Fixed a bug that would doubly-escape paths with spaces when launching Shiny apps on Windows via `cmd.exe`. ([#46](https://github.com/posit-dev/shiny-vscode/issues/46))

## 0.1.6

- "Run Shiny App" now works with Python executable paths that have spaces or other special characters. (#26)
- "Run Shiny App" now starts a fresh console for each run (and closes the last console it started), so that the app's output is not mixed with the output of previous runs. (#27)
- Improved compatibility with GitHub Codespaces. (#27)

## 0.1.5

- Recognize files named \*-app.py and \*\_app.py as potentially Shiny apps, enabling the "Run Shiny App" and "Debug Shiny App" buttons. (We continue to recognize app.py, app-\*.py, and app\_\*.py.) (#19)
- Stop using an exported API from the ms-python.python extension that has been deprecated and replaced. (#19)

## 0.1.4

- No code changes; required a new version number to recover from continuous integration issue.

## 0.1.3

- Add "Debug Shiny App" button to launch Shiny apps under the Python debugger. (#17)

## 0.1.2

- Recognize files named app-\*.py and app\_\*.py as potentially Shiny apps (and enabling the "Run Shiny App" button).

## 0.1.1

- Compatibility with VS Code instances that are hosted by Posit Workbench.

## 0.1.0

- Fix Windows compatibility (issue #7, thanks @djsmith17).

## 0.0.4

- The default value for `shiny.python.port` is now `0`, which means "choose an unused port at runtime". This is convenient for running multiple apps simultaneously on the same machine. For convenience, the extension remembers each VS Code Workspace's most recent random port, and tries to use it if available.

## 0.0.3

- Initial release
