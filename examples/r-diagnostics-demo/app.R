library(shiny)
source("module.R")

ui <- fluidPage(
  titlePanel("Complex R Shiny Diagnostics Showcase"),
  sidebarLayout(
    sidebarPanel(
      sliderInput("bins", "Number of bins:", min = 1, max = 50, value = 30),
      textOutput("data_stats"),
      counterModuleUI("counter1")
    ),
    mainPanel(
      plotOutput("distPlot")
    )
  )
)

server <- function(input, output, session) {
  counterModuleServer("counter1")

  processed_data <- reactive({
    rnorm(input$bins)
  })

  output$data_stats <- renderText({
    paste("Data observations count:", length(processed_data))
  })

  output$distPlot <- renderPlot({
    hist(processed_data())
  })

  output$mismatched_summary_view <- renderPlot({
    plot(1:20)
  })
}

shinyApp(ui = ui, server = server)
