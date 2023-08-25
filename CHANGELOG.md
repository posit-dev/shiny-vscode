# Change Log

<!-- Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file. -->

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
