import * as assert from "assert";
import { validateShinyCode } from "../../diagnostics/engine";
import { ShinyDiagnosticCode } from "../../diagnostics/rules";

suite("Shiny Diagnostics Validator Suite", () => {
  suite("Python Shiny Validator", () => {
    test("Clean Shiny App produces no diagnostics", () => {
      const cleanApp = `
from shiny import App, reactive, render, ui

app_ui = ui.page_fluid(
    ui.input_slider("n", "N", 1, 100, 50),
    ui.output_text("result")
)

def server(input, output, session):
    @reactive.calc
    def doubled():
        return input.n() * 2

    @render.text
    def result():
        return f"Doubled: {doubled()}"

app = App(app_ui, server)
`;
      const diags = validateShinyCode(cleanApp, "python");
      assert.strictEqual(diags.length, 0);
    });

    test("Detects uncalled reactive calculation", () => {
      const buggyApp = `
from shiny import App, reactive, render, ui

app_ui = ui.page_fluid(
    ui.output_text("result")
)

def server(input, output, session):
    @reactive.calc
    def my_data():
        return [1, 2, 3]

    @render.text
    def result():
        return f"Data length: {len(my_data)}"

app = App(app_ui, server)
`;
      const diags = validateShinyCode(buggyApp, "python");
      const uncalledDiags = diags.filter(
        (d) => d.code === ShinyDiagnosticCode.uncalledReactive
      );
      assert.strictEqual(uncalledDiags.length, 1);
      assert.ok(uncalledDiags[0].message.includes("my_data"));
    });

    test("Detects side-effects inside @reactive.calc", () => {
      const buggyApp = `
from shiny import App, reactive, render, ui

app_ui = ui.page_fluid(
    ui.output_text("result")
)

def server(input, output, session):
    count = reactive.value(0)

    @reactive.calc
    def compute():
        count.set(count() + 1)
        return count()

    @render.text
    def result():
        return f"{compute()}"

app = App(app_ui, server)
`;
      const diags = validateShinyCode(buggyApp, "python");
      const calcDiags = diags.filter(
        (d) => d.code === ShinyDiagnosticCode.calcSideEffect
      );
      assert.strictEqual(calcDiags.length, 1);
    });

    test("Detects UI output and server function name mismatch", () => {
      const buggyApp = `
from shiny import App, render, ui

app_ui = ui.page_fluid(
    ui.output_text("declared_output_name")
)

def server(input, output, session):
    @render.text
    def mismatched_output_name():
        return "Hello World"

app = App(app_ui, server)
`;
      const diags = validateShinyCode(buggyApp, "python");
      const mismatchDiags = diags.filter(
        (d) => d.code === ShinyDiagnosticCode.idMismatch
      );
      assert.strictEqual(mismatchDiags.length, 1);
      assert.ok(mismatchDiags[0].message.includes("mismatched_output_name"));
    });

    test("Detects blocking sleep in async context", () => {
      const buggyApp = `
import time
from shiny import App, reactive, render, ui

app_ui = ui.page_fluid(
    ui.output_text("result")
)

def server(input, output, session):
    @reactive.extended_task
    async def long_task():
        time.sleep(5)
        return "done"

app = App(app_ui, server)
`;
      const diags = validateShinyCode(buggyApp, "python");
      const blockingDiags = diags.filter(
        (d) => d.code === ShinyDiagnosticCode.blockingAsync
      );
      assert.strictEqual(blockingDiags.length, 1);
    });
  });

  suite("R Shiny Validator", () => {
    test("Clean R Shiny app produces no diagnostics", () => {
      const cleanApp = `
library(shiny)

ui <- fluidPage(
  sliderInput("n", "N", 1, 100, 50),
  textOutput("result")
)

server <- function(input, output, session) {
  doubled <- reactive({
    input$n * 2
  })

  output$result <- renderText({
    paste("Doubled:", doubled())
  })
}

shinyApp(ui, server)
`;
      const diags = validateShinyCode(cleanApp, "r");
      assert.strictEqual(diags.length, 0);
    });

    test("Detects uncalled reactive in R Shiny", () => {
      const buggyApp = `
library(shiny)

ui <- fluidPage(
  textOutput("result")
)

server <- function(input, output, session) {
  my_data <- reactive({
    c(1, 2, 3)
  })

  output$result <- renderText({
    paste("Data length:", length(my_data))
  })
}
`;
      const diags = validateShinyCode(buggyApp, "r");
      const uncalledDiags = diags.filter(
        (d) => d.code === ShinyDiagnosticCode.uncalledReactive
      );
      assert.strictEqual(uncalledDiags.length, 1);
      assert.ok(uncalledDiags[0].message.includes("my_data"));
    });

    test("Detects side-effects inside reactive expression in R Shiny", () => {
      const buggyApp = `
library(shiny)

server <- function(input, output, session) {
  rv <- reactiveValues(count = 0)

  calc_val <- reactive({
    rv$count <- rv$count + 1
    rv$count
  })
}
`;
      const diags = validateShinyCode(buggyApp, "r");
      const sideEffectDiags = diags.filter(
        (d) => d.code === ShinyDiagnosticCode.calcSideEffect
      );
      assert.strictEqual(sideEffectDiags.length, 1);
    });

    test("Detects UI output mismatch in R Shiny", () => {
      const buggyApp = `
library(shiny)

ui <- fluidPage(
  plotOutput("main_plot")
)

server <- function(input, output, session) {
  output$mismatched_plot <- renderPlot({
    plot(1:10)
  })
}
`;
      const diags = validateShinyCode(buggyApp, "r");
      const mismatchDiags = diags.filter(
        (d) => d.code === ShinyDiagnosticCode.idMismatch
      );
      assert.strictEqual(mismatchDiags.length, 1);
      assert.ok(mismatchDiags[0].message.includes("mismatched_plot"));
    });
  });
});
