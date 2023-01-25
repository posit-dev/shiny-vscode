# Change Log

<!-- Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file. -->

## 0.0.5

- The next version of this extension will be published under a new Publisher name on the VS Code Marketplace, to reflect RStudio's rebranding to Posit. Unfortunately, there is no way for us to move the extension between publishers, so instead, this extension is deprecated and replaced with [posit.pyshiny](https://marketplace.visualstudio.com/items?itemName=posit.pyshiny).

## 0.0.4

- The default value for `shiny.python.port` is now `0`, which means "choose an unused port at runtime". This is convenient for running multiple apps simultaneously on the same machine. For convenience, the extension remembers each VS Code Workspace's most recent random port, and tries to use it if available.

## 0.0.3

- Initial release
