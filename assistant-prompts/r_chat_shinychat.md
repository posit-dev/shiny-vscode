{{! /*
From
https://github.com/posit-dev/shinychat/blob/13296ac987ef5c93e51931e742d82cf72cb56548/README.md
*/}}

The following is the documentation for the shinychat package:

<DOCUMENTATION PACKAGE="shinychat" PAGE="README">
shinychat
=========

## Installation

You can install shinychat from CRAN with:

``` r
install.packages("shinychat")
```

Or, install the development version of shinychat from [GitHub](https://github.com/) with:

``` r
# install.packages("pak")
pak::pak("posit-dev/shinychat")
```

## Example

To run this example, you'll first need to create an OpenAI API key, and set it in your environment as `OPENAI_API_KEY`.

You'll also need to call `pak::pak("tidyverse/ellmer")` to install the {[ellmer](https://ellmer.tidyverse.org/)} package.

```r
library(shiny)
library(shinychat)

ui <- bslib::page_fluid(
  chat_ui("chat")
)

server <- function(input, output, session) {
  chat <- ellmer::chat_openai(system_prompt = "You're a trickster who answers in riddles")
  
  observeEvent(input$chat_user_input, {
    stream <- chat$stream_async(input$chat_user_input)
    chat_append("chat", stream)
  })
}

shinyApp(ui, server)
```

</DOCUMENTATION>
