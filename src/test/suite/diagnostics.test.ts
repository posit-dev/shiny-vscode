import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { isShinyCode, validateShinyCode } from "../../diagnostics/engine";
import { initializeParsers } from "../../diagnostics/parser";
import {
  ShinyDiagnosticCode,
  ShinyDiagnosticSeverity,
} from "../../diagnostics/rules";

suiteSetup(() => initializeParsers(path.resolve(__dirname, "../../parsers")));

suite("Shiny Diagnostics Validator Suite", () => {
  suite("Python Shiny Validator", () => {
    test("Clean Shiny App produces no diagnostics", async () => {
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
      const diags = await validateShinyCode(cleanApp, "python");
      assert.strictEqual(diags.length, 0);
    });

    test("Detects uncalled reactive calculation with error severity", async () => {
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
      const diags = await validateShinyCode(buggyApp, "python");
      const uncalledDiags = diags.filter(
        (d) => d.code === ShinyDiagnosticCode.uncalledReactive
      );
      assert.strictEqual(uncalledDiags.length, 1);
      assert.strictEqual(
        uncalledDiags[0].severity,
        ShinyDiagnosticSeverity.error
      );
      assert.ok(uncalledDiags[0].message.includes("my_data"));
    });

    test("Detects side-effects inside @reactive.calc with error severity", async () => {
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
      const diags = await validateShinyCode(buggyApp, "python");
      const calcDiags = diags.filter(
        (d) => d.code === ShinyDiagnosticCode.calcSideEffect
      );
      assert.strictEqual(calcDiags.length, 1);
      assert.strictEqual(calcDiags[0].severity, ShinyDiagnosticSeverity.error);
    });

    test("Reports a possible UI output mismatch as a warning", async () => {
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
      const diags = await validateShinyCode(buggyApp, "python");
      const mismatchDiags = diags.filter(
        (d) => d.code === ShinyDiagnosticCode.idMismatch
      );
      assert.strictEqual(mismatchDiags.length, 1);
      assert.strictEqual(
        mismatchDiags[0].severity,
        ShinyDiagnosticSeverity.warning
      );
      assert.ok(mismatchDiags[0].message.includes("mismatched_output_name"));
    });

    test("Detects blocking sleep in async context with error severity", async () => {
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
      const diags = await validateShinyCode(buggyApp, "python");
      const blockingDiags = diags.filter(
        (d) => d.code === ShinyDiagnosticCode.blockingAsync
      );
      assert.strictEqual(blockingDiags.length, 1);
      assert.strictEqual(
        blockingDiags[0].severity,
        ShinyDiagnosticSeverity.error
      );
    });

    test("Warns when server sessions write a module-level reactive value", async () => {
      const buggyApp = `
from shiny import App, reactive, render, ui

user_session_state = reactive.value("guest")

def server(input, output, session):
    user_session_state.set(input.name())

app = App(ui.page_fluid(), server)
`;
      const diags = await validateShinyCode(buggyApp, "python");
      const leakDiags = diags.filter(
        (d) => d.code === ShinyDiagnosticCode.globalStateLeak
      );
      assert.strictEqual(leakDiags.length, 1);
      assert.strictEqual(
        leakDiags[0].severity,
        ShinyDiagnosticSeverity.warning
      );
    });

    test("Validates Shiny Python module files", async () => {
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
      const diags = await validateShinyCode(moduleCode, "python");
      const uncalledDiags = diags.filter(
        (d) => d.code === ShinyDiagnosticCode.uncalledReactive
      );
      assert.strictEqual(uncalledDiags.length, 1);
      assert.strictEqual(
        uncalledDiags[0].severity,
        ShinyDiagnosticSeverity.error
      );
      assert.ok(uncalledDiags[0].message.includes("compute_val"));
    });
  });

  suite("R Shiny Validator", () => {
    test("Clean R Shiny app produces no diagnostics", async () => {
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
      const diags = await validateShinyCode(cleanApp, "r");
      assert.strictEqual(diags.length, 0);
    });

    test("Detects uncalled reactive in R Shiny with error severity", async () => {
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
      const diags = await validateShinyCode(buggyApp, "r");
      const uncalledDiags = diags.filter(
        (d) => d.code === ShinyDiagnosticCode.uncalledReactive
      );
      assert.strictEqual(uncalledDiags.length, 1);
      assert.strictEqual(
        uncalledDiags[0].severity,
        ShinyDiagnosticSeverity.error
      );
      assert.ok(uncalledDiags[0].message.includes("my_data"));
    });

    test("Detects side-effects inside reactive expression in R Shiny with error severity", async () => {
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
      const diags = await validateShinyCode(buggyApp, "r");
      const sideEffectDiags = diags.filter(
        (d) => d.code === ShinyDiagnosticCode.calcSideEffect
      );
      assert.strictEqual(sideEffectDiags.length, 1);
      assert.strictEqual(
        sideEffectDiags[0].severity,
        ShinyDiagnosticSeverity.error
      );
    });

    test("Reports a possible R UI output mismatch as a warning", async () => {
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
      const diags = await validateShinyCode(buggyApp, "r");
      const mismatchDiags = diags.filter(
        (d) => d.code === ShinyDiagnosticCode.idMismatch
      );
      assert.strictEqual(mismatchDiags.length, 1);
      assert.strictEqual(
        mismatchDiags[0].severity,
        ShinyDiagnosticSeverity.warning
      );
      assert.ok(mismatchDiags[0].message.includes("mismatched_plot"));
    });

    test("Validates R Shiny module files", async () => {
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
      const diags = await validateShinyCode(moduleCode, "r");
      const uncalledDiags = diags.filter(
        (d) => d.code === ShinyDiagnosticCode.uncalledReactive
      );
      assert.strictEqual(uncalledDiags.length, 1);
      assert.strictEqual(
        uncalledDiags[0].severity,
        ShinyDiagnosticSeverity.error
      );
      assert.ok(uncalledDiags[0].message.includes("calc_sum"));
    });
  });

  suite("Shiny Code Detector", () => {
    test("Recognizes Shiny apps and module files", async () => {
      assert.strictEqual(
        await isShinyCode("from shiny import module, ui", "python"),
        true
      );
      assert.strictEqual(
        await isShinyCode("@module.server\ndef my_server(): pass", "python"),
        true
      );
      assert.strictEqual(
        await isShinyCode("mod_ui <- function(id) { ns <- NS(id) }", "r"),
        true
      );
      assert.strictEqual(
        await isShinyCode("calc <- reactive({ 10 })", "r"),
        true
      );
      assert.strictEqual(
        await isShinyCode("x = 1\ny = 2\nprint(x + y)", "python"),
        false
      );
    });
  });
});

suite("AST validation regressions", () => {
  test("Shared session state is detected regardless of its variable name", () => {
    const diagnostics = validateShinyCode(
      `from shiny import reactive
shared_state = reactive.Value(None)
def server(input, output, session):
    @reactive.effect
    def update():
        shared_state.set(input.name())
`,
      "python"
    );
    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(
      diagnostics[0].code,
      ShinyDiagnosticCode.globalStateLeak
    );
    assert.strictEqual(
      diagnostics[0].severity,
      ShinyDiagnosticSeverity.warning
    );
  });

  test("Read-only shared values and locally shadowed values are not session leaks", () => {
    assert.deepStrictEqual(
      validateShinyCode(
        `from shiny import reactive
user_count = reactive.value(0)
shared_state = reactive.value(None)
def server(input, output, session):
    shared_state = reactive.value(None)
    @reactive.effect
    def update():
        shared_state.set(input.name())
        print(user_count.get())
`,
        "python"
      ),
      []
    );
  });

  test("Intentional shared writes can suppress the session-state warning", () => {
    assert.deepStrictEqual(
      validateShinyCode(
        `from shiny import reactive
user_count = reactive.value(0)
def server(input, output, session):
    user_count.set(user_count.get() + 1)  # shiny: ignore shiny.globalStateLeak
`,
        "python"
      ),
      []
    );
  });

  for (const [language, text] of [
    [
      "python",
      `from shiny import render, ui
from extra_ui import extra_ui
app_ui = ui.page_fluid(ui.output_text("static"), extra_ui)
def server(input, output, session):
    @render.text
    def external_result():
        return "ok"
`,
    ],
    [
      "python",
      `from shiny import reactive, render, ui
app_ui = ui.page_fluid(ui.output_text("static"))
def server(input, output, session):
    @reactive.effect
    def insert():
        ui.insert_ui(ui.output_text(input.output_id()), selector="#target")
    @render.text
    def dynamic_result():
        return "ok"
`,
    ],
    [
      "python",
      `from shiny import module, render, ui
from counter_ui import counter_ui
app_ui = ui.page_fluid(ui.output_text("static"), counter_ui("counter"))
@module.server
def counter_server(input, output, session):
    @render.text
    def module_result():
        return "ok"
`,
    ],
    [
      "r",
      `library(shiny)
source("extra-ui.R")
ui <- fluidPage(textOutput("static"), extra_ui)
server <- function(input, output, session) {
  output$external_result <- renderText("ok")
}
`,
    ],
    [
      "r",
      `library(shiny)
ui <- fluidPage(textOutput("static"))
server <- function(input, output, session) {
  observe(insertUI(selector="#target", ui=textOutput(input$output_id)))
  output$dynamic_result <- renderText("ok")
}
`,
    ],
    [
      "r",
      `library(shiny)
source("counter-ui.R")
ui <- fluidPage(textOutput("static"), counterUI("counter"))
counterServer <- function(id) {
  moduleServer(id, function(input, output, session) {
    output$module_result <- renderText("ok")
  })
}
`,
    ],
  ] as const) {
    test(`${language} output matching avoids false errors for ${text.includes("module_result") ? "modules" : text.includes("dynamic_result") ? "dynamic UI" : "external UI"}`, () => {
      const diagnostics = validateShinyCode(text, language);
      assert.ok(
        diagnostics.every(
          (issue) =>
            issue.code === ShinyDiagnosticCode.idMismatch &&
            issue.severity === ShinyDiagnosticSeverity.warning
        )
      );
    });
  }

  test("R matches namespaced extension outputs and module output IDs", () => {
    const text = `library(shiny)
ui <- fluidPage(textOutput("summary"), plotly::plotlyOutput("chart"), DT::DTOutput("table"))
output$summary <- renderText("ok")
output$chart <- plotly::renderPlotly(plot_ly())
output$table <- DT::renderDT(data.frame(x=1))
counterUI <- function(id) {
  ns <- NS(id)
  textOutput(ns("count"))
}
counterServer <- function(id) {
  moduleServer(id, function(input, output, session) {
    output$count <- renderText("ok")
  })
}
`;
    assert.deepStrictEqual(validateShinyCode(text, "r"), []);
  });

  for (const language of ["python", "r"] as const) {
    test(`${language} matches normal, escaped, and raw output IDs`, () => {
      for (const literal of [
        '"result"',
        String.raw`"\u0072esult"`,
        language === "python" ? 'r"result"' : 'r"(result)"',
      ]) {
        const text =
          language === "python"
            ? `from shiny import render, ui
app_ui = ui.page_fluid(ui.output_text(${literal}))
@render.text
def result():
    return "ok"
@render.text
def missing():
    return "oops"
`
            : `library(shiny)
ui <- fluidPage(textOutput(${literal}))
output$result <- renderText("ok")
output$missing <- renderText("oops")
`;
        const diagnostics = validateShinyCode(text, language);
        assert.strictEqual(diagnostics.length, 1);
        assert.strictEqual(diagnostics[0].code, ShinyDiagnosticCode.idMismatch);
        assert.ok(diagnostics[0].message.includes("'missing'"));
      }
    });
  }

  test("Python ignores code-like strings and comments", async () => {
    const text = `from shiny import reactive, render
@reactive.calc
def data():
    return 1
@render.text
def result():
    # data and state.set(1)
    return "data state.set(1) time.sleep(1)"
`;
    assert.deepStrictEqual(await validateShinyCode(text, "python"), []);
  });

  test("Python handles stacked decorators and multiline UI calls", async () => {
    const text = `from shiny import reactive, render, ui
app_ui = ui.page_fluid(ui.output_text(
    "result"
))
@reactive.calc
@reactive.event(input.go)
def data():
    return 1
@render.text
@reactive.event(input.go)
def result():
    return data
`;
    const diags = await validateShinyCode(text, "python");
    assert.deepStrictEqual(
      diags.map((d) => d.code),
      [ShinyDiagnosticCode.uncalledReactive]
    );
    assert.strictEqual(diags[0].range.startLine, 11);
    assert.strictEqual(diags[0].range.startChar, 11);
  });

  test("Calc and async checks stay in their function scope", async () => {
    const text = `from shiny import reactive
import time
state = reactive.value(0)
@reactive.calc
def data():
    return 1
@reactive.effect
def update():
    state.set(1)
async def work():
    time.sleep(
        1
    )
def sync_work():
    time.sleep(1)
`;
    const diags = await validateShinyCode(text, "python");
    assert.deepStrictEqual(
      diags.map((d) => d.code),
      [ShinyDiagnosticCode.blockingAsync]
    );
    assert.strictEqual(diags[0].range.startLine, 10);
  });

  test("Reactive references are resolved in lexical scope", async () => {
    const text = `from shiny import reactive, render
def first_server():
    @reactive.calc
    def data():
        return 1
    @render.text
    def result():
        return data

def other_server():
    data = 10
    return data
`;
    const diags = await validateShinyCode(text, "python");
    assert.strictEqual(diags.length, 1);
    assert.strictEqual(diags[0].range.startLine, 7);
  });

  test("R ignores strings, comments, and field names", async () => {
    const text = `library(shiny)
data <- reactive({ 1 })
output$txt <- renderText({
  # data rv$x <- 1
  paste("data rv$x <- 1", input$data, data())
})
`;
    assert.deepStrictEqual(await validateShinyCode(text, "r"), []);
  });

  test("R handles multiline calls and does not leak reactive scope", async () => {
    const text = `library(shiny)
ui <- fluidPage(textOutput(
  "txt"
))
data <- reactive(
  {
    rv$x <- 1
    2
  }
)
observe({rv$x <- 2})
output$txt <- renderText({data})
`;
    const diags = await validateShinyCode(text, "r");
    assert.deepStrictEqual(
      diags.map((d) => d.code),
      [ShinyDiagnosticCode.calcSideEffect, ShinyDiagnosticCode.uncalledReactive]
    );
  });

  test("Comment suppressions are line-local and rule-specific in both languages", async () => {
    for (const language of ["python", "r"] as const) {
      const text =
        language === "python"
          ? `from shiny import reactive, render
@reactive.calc
def data():
    return 1
@render.text
def result():
    # shiny: ignore-next-line shiny.uncalledReactive
    first = data
    second = data  # shiny: ignore
    return data
`
          : `library(shiny)
data <- reactive({1})
# shiny: ignore-next-line shiny.uncalledReactive
first <- data
second <- data # shiny: ignore
third <- data
`;
      const diags = await validateShinyCode(text, language);
      assert.strictEqual(diags.length, 1);
      assert.strictEqual(
        diags[0].range.startLine,
        language === "python" ? 9 : 5
      );
    }
  });

  test("Shared Python rule codes can be suppressed in the editor", async () => {
    const text = `from shiny import render
@render.text
def result():
    first = input.n  # shiny: ignore UNCALLED_INPUT
    return input.n
`;
    const diags = await validateShinyCode(text, "python");
    assert.strictEqual(diags.length, 1);
    assert.strictEqual(diags[0].code, "UNCALLED_INPUT");
    assert.strictEqual(diags[0].range.startLine, 4);
  });

  test("Suppression-like strings do not suppress diagnostics", async () => {
    const text = `from shiny import reactive, render
@reactive.calc
def data():
    return 1
@render.text
def result():
    message = "# shiny: ignore-next-line"
    return data # shiny: ignore shiny.blockingAsync
`;
    const diags = await validateShinyCode(text, "python");
    assert.strictEqual(diags.length, 1);
  });

  test("Detection ignores Shiny words in strings and comments", async () => {
    assert.strictEqual(
      await isShinyCode('name = "shiny render module"\n# reactive', "python"),
      false
    );
    assert.strictEqual(
      await isShinyCode('name <- "shiny render module"\n# reactive', "r"),
      false
    );
  });
});

suite("Bundled analyzer suppression compatibility", () => {
  test("Handles suppression syntax in the bundled Python analyzer", async () => {
    const fixtures = JSON.parse(
      fs.readFileSync(
        path.resolve(
          __dirname,
          "../../../src/test/fixtures/validation-suppressions.json"
        ),
        "utf8"
      )
    ) as Array<{ name: string; code: string; lines: number[] }>;
    for (const fixture of fixtures) {
      const diagnostics = await validateShinyCode(fixture.code, "python");
      assert.deepStrictEqual(
        diagnostics.map((d) => d.range.startLine + 1),
        fixture.lines,
        fixture.name
      );
    }
  });
});

suite("AST reference context", () => {
  test("Keyword argument values are reactive reads", () => {
    const text = `from shiny import reactive, render
@reactive.calc
def data():
    return 1
@render.text
def result():
    return format(value=data)
`;
    const diagnostics = validateShinyCode(text, "python");
    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(
      diagnostics[0].code,
      ShinyDiagnosticCode.uncalledReactive
    );
  });
});
