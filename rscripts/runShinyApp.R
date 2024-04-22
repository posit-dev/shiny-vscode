usage <- "Usage: Rscript runShinyApp.R <path> <port> [--devmode]"

args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 2) {
  stop(usage)
}

path <- args[1]
port <- as.integer(args[2])
stopifnot(is.integer(port))
devmode <- "--devmode" %in% args

if (devmode) {
  shiny::devmode()
} else {
  options(shiny.autoreload = TRUE)
}

message("Running Shiny app")
message("-----------------")
message(sprintf('shiny::runApp(%s, port = %d)\n', deparse(path), port))

shiny::runApp(path, port = port, launch.browser = FALSE)
