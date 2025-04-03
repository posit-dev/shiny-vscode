To use a _brand.yml file in Shiny for R, pass it as the `theme` argument to a `page_*` function.

```R
ui <- page_sidebar(
  title = "Acme Sales Dashboard",
  theme = bs_theme(brand = "acme-brand.yml"),
  # ... the rest of your app ...
)
```
