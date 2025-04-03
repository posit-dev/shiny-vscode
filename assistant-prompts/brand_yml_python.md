To use a _brand.yml file in Shiny for Python, this is how to do it with Shiny Express syntax:

```py
from shiny.express import input, render, ui

ui.page_opts(theme=ui.Theme.from_brand(__file__))
```

And this is how to do it with Shiny Core Syntax:

```py
from shiny import ui

app_ui = ui.page_fluid(
    # App UI code...
    theme=ui.Theme.from_brand(__file__)
)
```

It also requires installing the `brand_yml` and `libsass` packages, so it should be added to `requirements.txt`.

