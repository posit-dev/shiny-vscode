usage <- "Usage: Rscript runShinyApp.R <path> <port> [--devmode]"

args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 2) {
  stop(usage)
}

path <- args[1]
port <- as.integer(args[2])
stopifnot(is.integer(port))
devmode <- "--devmode" %in% args

# When the extension launches this script it sets SHINY_RUN_APP_STATUS_FILE to
# a per-run file path. While it waits for the app's port to open, it also
# watches that file so a failed startup can be reported immediately instead of
# after a timeout. We write "error" (followed by the error message) if startup
# fails, or "exited" if shiny::runApp() returns before ever serving the app.
status_file <- Sys.getenv("SHINY_RUN_APP_STATUS_FILE", unset = "")

write_status <- function(status, details = "") {
  if (!nzchar(status_file)) {
    return(invisible())
  }
  lines <- if (nzchar(details)) c(status, details) else status
  # Write to a temp file and rename, so the extension never reads a
  # partially-written status.
  tmp <- paste0(status_file, ".tmp")
  writeLines(lines, tmp)
  file.rename(tmp, status_file)
  invisible()
}

tryCatch(
  {
    if (devmode) {
      shiny::devmode()
    } else {
      options(shiny.autoreload = TRUE)
    }

    message("Running Shiny app")
    message("-----------------")
    message(sprintf('shiny::runApp(%s, port = %d)\n', deparse(path), port))

    shiny::runApp(path, port = port, launch.browser = FALSE)

    # shiny::runApp() blocks while the app is serving. If it returns, the app
    # stopped (or never started, e.g. the file didn't create an app object).
    write_status("exited")
  },
  error = function(e) {
    write_status("error", conditionMessage(e))
    stop(e)
  }
)
