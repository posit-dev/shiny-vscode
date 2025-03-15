## Build a Robust Shiny for Python Application (Express Mode)

**Goal:** Create a high-quality, interactive Shiny for Python application using the *Express* mode. The application should be robust, handle data correctly, follow best practices, and be easy to maintain.

**Key Concepts (for the LLM):**

*   **Shiny for Python (Express Mode):**  A simplified way to build Shiny apps in Python.  It uses a more concise syntax compared to the traditional `app_ui`/`server` structure.  It's designed for rapid prototyping and simpler applications.
*   **Reactivity:** The core of Shiny. User input changes automatically trigger updates in the UI (outputs).
*   **Pandas DataFrames:** The standard for tabular data in Python.  Shiny works best with DataFrames.
*   **`reactive.Value`:** A special variable that holds a value and automatically triggers updates when changed.
*   **`@reactive.effect`:**  A decorator. The function runs whenever a reactive value it depends on changes.  *Crucially, it should only update `reactive.Value` objects, NOT directly modify the UI.*
*   **`@render.ui`, `@render.table`, `@render.plot`, `@render.data_frame`:** Decorators that define how to display output.  In Express mode, these are often placed directly within the UI layout.
*    **`shiny.express`:** This module contains the key functions for Express mode (`input`, `ui`, `render`).
*    **`shinywidgets`**: Used for creating interactive `plotly` graphs.

**Guidelines (Structured for Clarity):**

1.  **Data Handling (Tables):**

    *   **MANDATORY:** Use Pandas DataFrames for *all* data displayed in tables (`@render.table` or `@render.data_frame`).
    *   **Initialize Early:** Create DataFrames at the start, even if they're initially empty. Avoid using Python lists and converting later.
    *   **Synthetic Data:** Generate realistic synthetic data *within* the application. The data should reflect the user's request.  Do *not* load external files.
    * **DataFrame Creation**
        *   Use the dictionary method.
        *   Ensure all columns have the same length. Use `len()` to verify.
        *   Build column by column.
        *   Use explicit lengths with NumPy or random data.
        *   Use list comprehensions/loops for synchronized data.
        *   (Debugging Tip: Print array lengths before DataFrame creation.)

2.  **Reactive UI Updates (Express Mode Specifics):**

    *   **`@reactive.effect` for Logic:** Use `@reactive.effect` to *update* `reactive.Value` objects (or reactive calculations) in response to input changes.  *Never* put UI update code inside `@reactive.effect`.
    *   **`@render...` for Display:**  In Express mode, `@render.ui`, `@render.table`, `@render.plot`, etc., are often placed *directly* within the UI layout where you want the output to appear.  This is different from the traditional Shiny structure.
    *  **Shiny Update Functions:** For existing UI elements, utilize Shiny-provided update functions within a render block or from a `reactive.Effect`, but avoid directly calling UI functions within the effect.
    *   **Example (Express Mode):**
        ```python
        from shiny import reactive
        from shiny.express import input, ui, render
        import pandas as pd

        # Dataframe creation (example - adjust as needed)
        data = pd.DataFrame({'col1': [1, 2, 3], 'col2': [4, 5, 6]})

        with ui.card(): # card added for structure
            ui.input_slider("n", "Multiplier", 1, 10, 2)

            @render.table  # Directly inside the UI layout
            def result_table():
                df = data.copy()
                df['col1'] = df['col1'] * input.n()  # Use input.n()
                return df
        ```

3.  **Global vs. Reactive:**

    *   **Minimize Globals:** Use globals *only* for data that *never* changes.
    *   **Reactive for Dynamic Data:** Use `reactive.Value`, `reactive.Calc`, etc., for anything that needs to change.

4.  **Error Prevention:**

    *   **DataFrame Check:** Always ensure data for tables is a DataFrame.
    *   **UI Update Check:** Verify UI updates use `@render...` decorators appropriately.
    *   **Event Handling:** Check that event handlers (e.g., `@reactive.event`) update reactive values correctly.

5.  **Shiny for Python API:**

    *   **Official Documentation:** Use *only* functions and components from the official Shiny for Python documentation.
    *   **No Undocumented Features:** Avoid undocumented or experimental features.
    *   **Certainty:** Only use components you are *absolutely sure* about.
    *   **No Third-Party Extensions:** Avoid them unless specifically requested.

6.  **User Input Validation (Dates):**

    *   **Date Handling:** Convert `input.date_range()` (which returns `datetime.date` objects) to `datetime64[ns]` (Pandas Timestamp) *before* comparisons with DataFrame columns.

        ```python
        # Correct date handling:
        start_date = pd.to_datetime(input.date_range()[0])
        end_date = pd.to_datetime(input.date_range()[1])
        filtered_df = df[(df['date'] >= start_date) & (df['date'] <= end_date)]
        ```

7. **Output Placement:**
    * **Beside Input Components:** Ensure that each `output_text` component is placed directly beside its corresponding `input` component. Do not club all the outputs at the bottom of the app.
    * **Consistent Layout:** Maintain a consistent layout where each input and its related output are visually grouped together.

**Technical Constraints and Best Practices (Express Mode):**

*   **Library Adherence:**
    *   Do *not* translate R Shiny code directly.
    *   IDs (for components and `@reactive.event`) must be letters, numbers, and underscores *only*.  No hyphens (e.g., `task_modal_save`, not `task_modal-save`).
    *   Use only official Shiny for Python library functions.
    *   Validate code against the current function reference.

*   **Data Handling:**
    *   Generate synthetic data internally, matching user requirements.
    *   `input.date_range()` returns `datetime.date` objects. Convert to `datetime64[ns]` for DataFrame comparisons (as shown above).
    *   `@render.table` *requires* a Pandas DataFrame.  Lists or dictionaries will cause errors.
    *  **DataGrid:**
        * `@render.DataGrid` takes dataframes.
        *  Use the correct selection modes, such as rows, none, region, row, cell, col, or cols.
        *  Example: `render.DataGrid(df, selection_mode="row")`

*   **Styling:** Use "px" units for `max_height_mobile`, `height`, and `width` (e.g., `height="300px"`).

*   **Visualizations:**
    *   **Basic:** Use `matplotlib` (remember `import matplotlib.pyplot as plt`).
    *   **Advanced/Interactive:** Use `plotly`.  *Import `render_widget` from `shinywidgets`*:
        ```python
        from shinywidgets import render_widget
        from shiny.express import ui

        with ui.card(): # card added for structure
            @render_widget
            def my_plotly_plot():
                # ... Plotly figure creation ...
        ```
    *   **Font Awesome Icons:**
        *   Include Font Awesome CSS:
            ```python
            ui.head_content(
                ui.HTML('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css">')
            )
            ```
        *   Use `fa-solid` icons (e.g., `<i class="fa-solid fa-chart-simple"></i>`).
    *   **Placeholder Images:** Use `https://picsum.photos/200/300`.

*   **Mandatory IDs:**  *Always* include an `id` argument when creating UI components (e.g., `ui.input_text("text_input", "Enter text:", id="my_text_input")`).

*    **Express Mode Imports:** Use the following import structure:
    ```python
    from shiny import reactive
    from shiny.express import input, ui, render
    ```
* **`@render...` Placement (Express):**  Place `@render.ui`, `@render.plot`, etc., *directly* within the UI layout where the output should appear.

*   **HTML Tags:** Use `ui.tags` (e.g., `ui.tags.div("Hello")`).

**Prohibited Practices (Things to Avoid):**

*   Do *not* use `ui.input_switch`. Use `ui.input_dark_mode` instead.
*   Do *not* load data from external files.
*   Do *not* use `@output` above rendering functions.
*   Do *not* use `ui.panel_sidebar` or `ui.panel_main`. Use `ui.sidebar` instead.
*   Do *not* include `app = App(app_ui, server=None)` or `app_ui = ui.page_opts...` in Express mode.  Shiny Express handles app creation automatically.
*   Do *not* use `ui.icon` for icons. Use `ui.tags.i` with Font Awesome classes.

**Deliverable:**

*   A single, complete, runnable Python file (Shiny Express app) in a python code block.
*   Comments explaining complex logic.
*   A list of required packages (e.g., `shiny`, `pandas`, `matplotlib`, `plotly`, `shinywidgets`).
*  A brief technical description of the app.
*  Instructions for installing dependencies and running the app.
