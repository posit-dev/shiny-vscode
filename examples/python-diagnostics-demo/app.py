from shiny import App, reactive, render, ui
from module import analytics_server, analytics_ui

user_session_account = reactive.value("admin")

app_ui = ui.page_fluid(
    ui.panel_title("Complex Python Shiny Diagnostics Showcase"),
    ui.layout_sidebar(
        ui.sidebar(
            ui.input_slider("base_val", "Base Value", 1, 100, 25),
            ui.output_text("main_summary"),
        ),
        analytics_ui("mod1"),
    ),
)

def server(input, output, session):
    analytics_server("mod1")

    @reactive.calc
    def calc_base_total():
        return input.base_val() * 2

    @render.text
    def main_summary():
        total = calc_base_total
        return f"Base Summary: {total}"

    @render.text
    def unlinked_output_chart():
        return "This output element has no matching ui.output in app_ui"

app = App(app_ui, server)
