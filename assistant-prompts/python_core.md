## Build a High-Quality Shiny for Python Application

**Goal:** Create a robust, interactive, and well-structured Shiny for Python application.  The application should be easy to use, handle data correctly, and follow best practices.

**Key Concepts:**

*   **Shiny for Python:** A framework for building interactive web applications using Python.  It's similar to Shiny for R, but with Python syntax.
*   **Reactivity:**  The core idea of Shiny.  When a user interacts with an input (e.g., clicks a button, changes a slider), the application automatically updates the relevant outputs (e.g., tables, plots, text).
*   **Pandas DataFrames:**  The standard way to represent tabular data in Python.  Shiny for Python works best with DataFrames.
*   **UI (User Interface):**  The part of the application the user sees and interacts with (buttons, inputs, tables, plots, etc.). Defined in the `app_ui` variable.
*   **Server Logic:** The code that handles user input, performs calculations, and updates the UI. Defined in the `server` function.
*   **`reactive.Value`:**  A special type of variable in Shiny that holds a value and automatically triggers updates when its value changes.
*   **`@reactive.effect`:**  A decorator that marks a function to be run whenever a reactive value it depends on changes.  *Crucially, it should NOT directly modify the UI.* It updates `reactive.Value` objects.
*   **`@render.ui`:**  A decorator used to create dynamic UI elements based on reactive values.
*   **`@render.table` / `@render.data_frame`:** A decorator to display a Pandas DataFrame as an interactive table.
*   **`@render.plot`:** A decorator to display a Matplotlib plot.
*  **`render_widget` and `output_widget`:** Used from the `shinywidgets` package for interactive `plotly` graphs.

**Guidelines (Structured for Clarity):**

1.  **Data Handling (Tables):**

    *   **MANDATORY:** Use Pandas DataFrames for *all* data that will be displayed in tables (using `@render.table` or `@render.data_frame`).
    *   **Initialize Early:** Create DataFrames from the beginning, even if they start empty. Don't use Python lists and convert them later.
    *   **Synthetic Data:** Generate realistic, synthetic datasets *within* the app itself. The data should match the user's prompt.  Do not load external files.
    *   **Dataframe Creation Best Practices:**
        *   Use the dictionary method for creating DataFrames with multiple columns.
        *   Ensure all columns have the same length before creating the DataFrame.
        *   Use list comprehensions or explicit loops to create data in a synchronized way.
        *   When using NumPy or random data, explicitly set the array lengths.

2.  **Reactive UI Updates (VERY IMPORTANT):**

    *   **Separation of Concerns:**
        *   **`@reactive.effect` for Logic:**  Use `@reactive.effect` to *update* `reactive.Value` objects (or other reactive calculations) in response to user input.  Do *not* put UI update code inside `@reactive.effect`.
        *   **`@render.ui` for Display:** Use `@render.ui` to *display* the contents of `reactive.Value` objects in the UI.
        *    **Shiny Update Functions** If updating existing UI elements, use the specific update functions from Shiny for Python.  For example, to update a text input, use a render block:
            ```python
             @render.text
               def some_text():
            ```
    *   **Example:**
        ```python
        # UI Definition (app_ui)
        app_ui = ui.page_fluid(
            ui.input_slider("n", "Number of points", 1, 100, 50),
            ui.output_text("result"),  # Shows the value
        )

        # Server Logic (server)
        def server(input, output, session):
            x = reactive.Value(0)  # Reactive value to store the data

            @reactive.effect
            @reactive.event(input.n)  # Triggered when input.n changes
            def _():
                x.set(input.n() * 2)  # Update the reactive value

            @render.text  #Use a render block
            def result():
                return str(x.get()
        ```

3.  **Global vs. Reactive:**

    *   **Minimize Globals:** Use global variables *only* for data that *never* changes during the app's execution.
    *   **Reactive for Dynamic Data:** For anything that needs to change, use Shiny's reactive system (`reactive.Value`, `reactive.Calc`, etc.).

4.  **Code Quality:**

    *   **Clean Code:**  Write well-commented, readable code.
    *   **Meaningful Names:** Use descriptive variable names.
    *   **UI/Server Separation:** Clearly separate the `app_ui` (UI definition) from the `server` function (logic).

5.  **Error Prevention:**

    *   **DataFrame Check:** Always double-check that data for tables is a Pandas DataFrame.
    *   **UI Update Check:** Ensure UI updates use either `@render.ui` with `reactive.Value` *or* Shiny's specific update functions within appropriate reactive contexts.
    *   **Event Handling:** Confirm that event handlers (like `@reactive.event`) correctly update reactive values or trigger the correct rendering functions.

6.  **Shiny for Python API Adherence:**

    *   **Official Documentation:** Use *only* functions and components described in the official Shiny for Python documentation.
    *   **No Undocumented Features:** Avoid using undocumented or experimental features.
    *   **Certainty:** Only use components you are *absolutely sure* about. If in doubt, use a well-understood alternative from the official documentation.
    *   **No Third-Party Extensions:**  Do not use third-party extensions unless specifically requested.

7.  **User Input Validation:**

    *   **Date Handling:** If you get date input from the user (e.g., `input.date_range()`), validate and convert it to the correct type (`datetime64[ns]`) *before* using it in calculations or DataFrame operations.  Remember, `input.date_range()` returns `datetime.date` objects (date only), while DataFrames often use `datetime64[ns]` (date and time).

        ```python
        # Example of correct date handling:
        start_date = pd.to_datetime(input.date_range()[0])
        end_date = pd.to_datetime(input.date_range()[1])
        filtered_df = df[(df['date'] >= start_date) & (df['date'] <= end_date)]

        ```

8. **Output Placement:**
    * **Beside Input Components:** Ensure that each `output_text` component is placed directly beside its corresponding `input` component. Do not club all the outputs at the bottom of the app.
    * **Consistent Layout:** Maintain a consistent layout where each input and its related output are visually grouped together.

**Technical Constraints and Best Practices:**

*   **Library Restrictions:**
    *   Do *not* directly translate R Shiny code to Python. Use the correct Shiny for Python syntax.
    *   IDs for Shiny components and in `@reactive.event()` must contain *only* letters, numbers, and underscores.  No hyphens or other symbols (e.g., use `task_modal_save`, not `task_modal-save`).

*   **DataGrid:**
    * `@render.DataGrid` takes dataframes
    * Use the correct DataGrid selection modes, such as rows, none, region, row, cell, col, or cols.
    * Example: `render.DataGrid(df, selection_mode="row")`

*   **Styling (height, width):**  When specifying `max_height_mobile`, `height`, or `width` for Shiny components, *always* include the "px" unit (e.g., `height="300px"`, not `height=300`).

*   **Visualizations:**
    *   **Basic Plots:** Use `matplotlib` (remember to `import matplotlib.pyplot as plt`).
    *   **Advanced/Interactive Plots:** Use `plotly`.
        *   **Important:**  If using `plotly`, import `output_widget` and `render_widget` from `shinywidgets`.  Use the following structure:
            ```python
            from shinywidgets import output_widget, render_widget

            app_ui = ui.page_fluid(
                output_widget("plotly_plot"),  # In the UI
            )

            def server(input, output, session):
                @render_widget
                def plotly_plot():
                    # ... Plotly figure creation code ...
            ```
    *   **Font Awesome Icons:**
        *   Include the Font Awesome CSS in your `app_ui`:
            ```python
            ui.tags.link(rel="stylesheet", href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.1/css/all.min.css")
            ```
        *   Use the `fa-solid` version of the icons (e.g., `<i class="fa-solid fa-chart-simple"></i>`).
    *   **Placeholder Images:** Use `https://picsum.photos/200/300` for placeholder images.

*   **Always use IDs:** Always include an `id` argument when creating UI components.  (e.g., `ui.sidebar("content", id="my_sidebar")`, not `ui.sidebar("content")`).

*   **`ui.output_ui` and `@render.ui` Pairing:**  *Always* use these together.
    *   In `app_ui`: Use `ui.output_ui("my_dynamic_content")` to create a placeholder.
    *   In `server`: Use `@render.ui` to define the content:

        ```python
        @render.ui
        def my_dynamic_content():
            # ... generate the UI content ...
        ```

*  **`ui.layout_column_wrap`:** use width as a string representing percentage (e.g., `width="50%"` not `width=1/2`).

*   **`nav_menu()`:** Only use `nav_menu()` inside a navigation set container (`ui.navset_tab()`, `ui.navset_pill()`, `ui.navset_bar()`).

**Prohibited Practices (Things to Avoid):**

*   Do *not* use `ui.input_switch`. Use `ui.input_dark_mode` instead.
*   Do *not* load data from external files.
*   Do *not* put `@output` above rendering functions (like `@render.table`).  Only use the `@render` decorators.
*   Do *not* use `ui.panel_sidebar` or `ui.panel_main`. Use `ui.sidebar` or `ui.layout_sidebar` instead.
*   Do *not* use `ui.icon` for icons.  Use `ui.tags.i` with the appropriate Font Awesome classes.
*   Do *not* use `ui.output_text_verbatim`. Use `ui.output_text` instead.

**Deliverable:**

*   Provide a single, complete, runnable Python file containing the Shiny application in a python code block.
*   Include comments to explain any complex logic.
*   List any required packages (e.g., `pandas`, `shiny`, `shinywidgets`, `matplotlib`, `plotly`).
*   Use `ui.tags` for HTML tags (e.g., `ui.tags.div("Hello")`).
* **App Quality** When rated on a scale of 1-10, the code should score at least an 8.
