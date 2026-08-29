import * as assert from "assert";
import { isShinyCode, validateShinyCode } from "../../diagnostics/engine";
import {
  ShinyDiagnosticCode,
  ShinyDiagnosticSeverity,
} from "../../diagnostics/rules";

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

    test("Detects uncalled reactive calculation with error severity", () => {
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
      assert.strictEqual(uncalledDiags[0].severity, ShinyDiagnosticSeverity.error);
      assert.ok(uncalledDiags[0].message.includes("my_data"));
    });

    test("Detects side-effects inside @reactive.calc with error severity", () => {
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
      assert.strictEqual(calcDiags[0].severity, ShinyDiagnosticSeverity.error);
    });

    test("Detects UI output and server function name mismatch with error severity", () => {
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
      assert.strictEqual(mismatchDiags[0].severity, ShinyDiagnosticSeverity.error);
      assert.ok(mismatchDiags[0].message.includes("mismatched_output_name"));
    });

    test("Detects blocking sleep in async context with error severity", () => {
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
      assert.strictEqual(blockingDiags[0].severity, ShinyDiagnosticSeverity.error);
    });

    test("Detects global state leak with error severity", () => {
      const buggyApp = `
from shiny import App, reactive, render, ui

user_session_state = reactive.value("guest")

def server(input, output, session):
    pass

app = App(ui.page_fluid(), server)
`;
      const diags = validateShinyCode(buggyApp, "python");
      const leakDiags = diags.filter(
        (d) => d.code === ShinyDiagnosticCode.globalStateLeak
      );
      assert.strictEqual(leakDiags.length, 1);
      assert.strictEqual(leakDiags[0].severity, ShinyDiagnosticSeverity.error);
    });

    test("Validates Shiny Python module files", () => {
      const moduleCode = `
from shiny import module, reactive, render, ui

@module.ui
def mod_counter_ui():
    return ui.TagList(
        ui.input_action_button("btn", "Click"),
        ui.output_text("txt")
    )

@module.server
def mod_counter_server(input, output, session):
    @reactive.calc
    def compute_val():
        return input.btn() * 10

    @render.text
    def txt():
        return f"Val: {compute_val}"
`;
      const diags = validateShinyCode(moduleCode, "python");
      const uncalledDiags = diags.filter(
        (d) => d.code === ShinyDiagnosticCode.uncalledReactive
      );
      assert.strictEqual(uncalledDiags.length, 1);
      assert.strictEqual(uncalledDiags[0].severity, ShinyDiagnosticSeverity.error);
      assert.ok(uncalledDiags[0].message.includes("compute_val"));
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

    test("Detects uncalled reactive in R Shiny with error severity", () => {
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
      assert.strictEqual(uncalledDiags[0].severity, ShinyDiagnosticSeverity.error);
      assert.ok(uncalledDiags[0].message.includes("my_data"));
    });

    test("Detects side-effects inside reactive expression in R Shiny with error severity", () => {
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
      assert.strictEqual(sideEffectDiags[0].severity, ShinyDiagnosticSeverity.error);
    });

    test("Detects UI output mismatch in R Shiny with error severity", () => {
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
      assert.strictEqual(mismatchDiags[0].severity, ShinyDiagnosticSeverity.error);
      assert.ok(mismatchDiags[0].message.includes("mismatched_plot"));
    });

    test("Validates R Shiny module files", () => {
      const moduleCode = `
counterServer <- function(id) {
  moduleServer(id, function(input, output, session) {
    calc_sum <- reactive({
      input$count * 2
    })

    output$txt <- renderText({
      paste("Sum:", calc_sum)
    })
  })
}
`;
      const diags = validateShinyCode(moduleCode, "r");
      const uncalledDiags = diags.filter(
        (d) => d.code === ShinyDiagnosticCode.uncalledReactive
      );
      assert.strictEqual(uncalledDiags.length, 1);
      assert.strictEqual(uncalledDiags[0].severity, ShinyDiagnosticSeverity.error);
      assert.ok(uncalledDiags[0].message.includes("calc_sum"));
    });
  });

  suite("Shiny Code Detector", () => {
    test("Recognizes Shiny apps and module files", () => {
      assert.strictEqual(isShinyCode("from shiny import module, ui"), true);
      assert.strictEqual(isShinyCode("@module.server\ndef my_server(): pass"), true);
      assert.strictEqual(isShinyCode("mod_ui <- function(id) { ns <- NS(id) }"), true);
      assert.strictEqual(isShinyCode("calc <- reactive({ 10 })"), true);
      assert.strictEqual(isShinyCode("x = 1\ny = 2\nprint(x + y)"), false);
    });
  });
});
