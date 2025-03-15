When converting a Shiny app from express syntax to core syntax, keep these points in mind:

1. **App Structure:**
   - **Core:** Requires an explicit `App` object creation with separate `app_ui` and `server` functions.  Express syntax implicitly defines these.
   - **Example:**
     ```python
     # Core
     from shiny import App, ui

     app_ui = ui.page_fluid(...)

     def server(input, output, session):
         ...

     app = App(app_ui, server)

     # Express
     from shiny.express import ui

     # There is not a page_fluid() function, but can set options with
     ui.page_opts(...)
     ... # rest of the express code
     ```

2. **UI definition:**
   - **Core:** The UI is defined as a single composable UI element (e.g., `ui.page_fluid`, `ui.page_fixed`, `ui.page_fillable`). All UI elements are nested within this top-level element. Express syntax defines the UI piece by piece.
   - **Example:** See the difference in `app_ui` between core and express versions of any example.  Pay attention to how elements are nested.

3. **Server function:**
   - **Core:** The server logic resides within a dedicated `server(input, output, session)` function. Express syntax mixes UI definitions and reactive code in the same scope.
   - **Example:**  The `server` function is explicit in core Shiny. In express mode, reactive functions (`@reactive.Effect`, `@render.ui`, etc.) are placed directly at the top level of the app.py file.

4. **Outputs:**
   - **Core:** Outputs are declared in the UI with `ui.output_<output_type>(<id>)` and rendered in the server function using `@output` and `@render.<render_type>`. Express syntax uses `@render.<render_type>` directly.
   - **Example:** Compare `outputs/text` examples. Core Shiny uses `ui.output_text_verbatim("text")` in the UI and `@render.text` in the server.  Express just uses `@render.text`.

5. **Inputs:**
   - **Core:** Input values are accessed via `input.<input_id>()` inside the `server` function.  This is the same in express.
   - **Example:** In both core and express, if you have `ui.input_text("my_input", ...)` you access its value with `input.my_input()`.

6. **Reactivity:**
   - **Core:** The `reactive`, `render`, and `ui` modules are accessed using their full names (e.g., `shiny.reactive`, `shiny.render`). Express imports these directly into the current namespace.
   - **Example:** `from shiny import reactive, render, ui` in core apps vs `from shiny.express import reactive, render, ui, input` in express apps.

7. **`shinywidgets`:** Handling of `shinywidgets` is almost identical, but the `output_widget()` function needs to be within `app_ui` in core shiny, where as in express syntax, it is called directly to create the output element.  `render_widget` functions are the same.

8. **Explicit UI updates:** Some complex UI elements, like modals or notifications, may require explicitly calling functions like `ui.modal_show(m)` in core Shiny apps within an `@reactive.Effect` which were automatically handled in express syntax by virtue of the context they were declared in. Look at the `modal` and `chat` examples to see these differences.

9. **Context Managers and Decorators:**  These are used the same way in express and core Shiny.  The main difference is just *where* you put the reactive functions.

By carefully addressing these points, you can effectively convert your express Shiny apps to the core framework, giving you more structure and flexibility as your app grows more complex.  Always consult the Shiny documentation for detailed explanations and examples.

10. Do not add `title` argument to the `App` object.  This is not supported in core Shiny.
## Wrong approach
```python
app = App(
    app_ui,
    server,
    # Set page title
    title="Date Range Input Demo",
)
```
## Right approach
```python
app = App(
    app_ui,
    server,
)
```
