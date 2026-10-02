library(shiny)

counterModuleUI <- function(id) {
  ns <- NS(id)
  tagList(
    h4("Counter Module"),
    actionButton(ns("increment"), "Increment Counter"),
    textOutput(ns("counter_label"))
  )
}

counterModuleServer <- function(id) {
  moduleServer(id, function(input, output, session) {
    rv <- reactiveValues(count = 0)

    mod_calculation <- reactive({
      rv$count <- rv$count + 1
      rv$count * 5
    })

    output$counter_label <- renderText({
      paste("Calculated Score:", mod_calculation)
    })
  })
}
