# Shiny - VS Code Extension

This is an extension to help launch [Shiny applications](https://shiny.posit.co). Shiny is a package for [Python](https://shiny.posit.co/py/) and [R](https://shiny.posit.co/r/getstarted/) that is designed to make it easy to build interactive web applications with the powerful data and scientific features of Python and R.

## Features

The main features of this extension are additional options in the Run button menu when editing an `app.py` or `app.R` file to "Run Shiny App" or "Debug Shiny App" (Python only).

![Run app](https://shiny.posit.co/py/docs/assets/vscode.png)

It also provides a couple of code snippets in both Python and R:

- `shinyapp` for creating a new Shiny application
- `shinymod` for creating a new Shiny module

For a complete Shiny for Python experience in VS Code, please [visit our docs for more information](https://shiny.posit.co/py/docs/install-create-run.html#vs-code), including instructions for configuring the type checker and debugger for use with Shiny.

## Extension Settings

This extension contributes the following settings for Python and R.

### Python

- `shiny.python.port`: The port number to listen on when running a Shiny for Python app. (By default, 0, which will choose a random port for each workspace.)
- `shiny.python.debugJustMyCode`: When running the "Debug Shiny App" command, only step through user-written code. Disable this to allow stepping through library code. (Defaults to true.)

Note that there is no setting for Python executable path or virtual environment. This extension uses whatever Python environment the VS Code Python extension thinks is active. If you find that the "Run Shiny App" and "Debug Shiny App" commands are launching with a different version of Python or different virtual environment than you intended, use the Python extension's [Select Interpreter](https://code.visualstudio.com/docs/python/environments#_working-with-python-interpreters) command to change it.

### R

- `shiny.r.port`: The port number to listen on when running a Shiny app. (By default, 0, which will choose a random port for each workspace.)
- `shiny.r.devmode`: When `true` (default), Shiny for R apps are launched [in developer mode](https://shiny.posit.co/r/reference/shiny/latest/devmode.html).
