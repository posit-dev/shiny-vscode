import time
from shiny import module, reactive, render, ui

@module.ui
def analytics_ui():
    return ui.card(
        ui.card_header("Analytics Submodule"),
        ui.input_numeric("multiplier", "Multiplier", value=2, min=1, max=10),
        ui.input_action_button("calc_btn", "Compute Heavy Task"),
        ui.output_text("stat_display"),
        ui.output_text("task_status"),
    )

@module.server
def analytics_server(input, output, session):
    submodule_counter = reactive.value(0)

    @reactive.calc
    def compute_stats():
        submodule_counter.set(submodule_counter() + 1)
        return input.multiplier() * 100

    @render.text
    def stat_display():
        val = compute_stats
        return f"Calculated value: {val}"

    @reactive.extended_task
    async def heavy_analytics_task():
        time.sleep(3)
        return "Heavy task finished"

    @render.text
    def task_status():
        return f"Status: {heavy_analytics_task.result()}"
