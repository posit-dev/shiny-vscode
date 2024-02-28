# Shiny for Python

This is an extension to help launch [Shiny for Python](https://shiny.rstudio.com/py/) applications. Shiny is a Python package that is designed to make it easy to build interactive web applications with the power of Python’s data and scientific stack.

## Features

The main features of this extension are the addition of "Run Shiny App" and "Debug Shiny App" options to the Run button when an app.py is being edited.

![Run app](https://shiny.rstudio.com/py/docs/assets/vscode.png)

It also provides a couple of Python snippets:

- `shinyapp` for creating a new Shiny application
- `shinymod` for creating a new Shiny module

See [the docs](https://shiny.rstudio.com/py/docs/install.html#configure-visual-studio-code) for more information, including instructions for configuring the type checker and debugger for use with Shiny.

## Extension Settings

This extension contributes the following settings:

- `shiny.python.port`: The port number to listen on when running a Shiny app. (By default, 0, which will choose a random port for each workspace.)
- `shiny.python.debugJustMyCode`: When running the "Debug Shiny App" command, only step through user-written code. Disable this to allow stepping through library code. (Defaults to true.)

Note that there is no setting for Python executable path or virtual environment. This extension uses whatever Python environment the VS Code Python extension thinks is active. If you find that the "Run Shiny App" and "Debug Shiny App" commands are launching with a different version of Python or different virtual environment than you intended, use the Python extension's [Select Interpreter](https://code.visualstudio.com/docs/python/environments#_working-with-python-interpreters) command to change it.
