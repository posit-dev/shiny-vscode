{{! /*
From
https://github.com/tidyverse/ellmer
Commit 524a14d

# Note: replace [star][star] below with asterisk characters!
# The parser for squirrelly thinks this comment ends when there's a star-slash.
npx repomix . --top-files-len 100 --include "README.md,vignettes/[star].Rmd"

# Need to replace an instance of {{ }} in the text with braces and quotes for
# squirrelly to handle it.
sed -i '' 's/{{ }}/{{ "{{ }}" }}/' repomix-output.xml

# Copy to clipboard, then paste below
cat repomix-output.xml | pbcopy
*/
}}

The following is the documentation for the ellmer package:

<DOCUMENTATION PACKAGE="ellmer">
This file is a merged representation of a subset of the codebase, containing specifically included files, combined into a single document by Repomix.

<file_summary>
This section contains a summary of this file.

<purpose>
This file contains a packed representation of the entire repository's contents.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.
</purpose>

<file_format>
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Repository files, each consisting of:
  - File path as an attribute
  - Full contents of the file
</file_format>

<usage_guidelines>
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.
</usage_guidelines>

<notes>
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Only files matching these patterns are included: README.md, vignettes/*.Rmd
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Files are sorted by Git change count (files with more changes are at the bottom)
</notes>

<additional_info>

</additional_info>

</file_summary>

<directory_structure>
vignettes/
  ellmer.Rmd
  prompt-design.Rmd
  streaming-async.Rmd
  structured-data.Rmd
  tool-calling.Rmd
README.md
</directory_structure>

<files>
This section contains the contents of the repository's files.

<file path="vignettes/streaming-async.Rmd">
---
title: "Streaming and async APIs"
output: rmarkdown::html_vignette
vignette: >
  %\VignetteIndexEntry{Streaming and async APIs}
  %\VignetteEngine{knitr::rmarkdown}
  %\VignetteEncoding{UTF-8}
---

```{r, include = FALSE}
knitr::opts_chunk$set(
  collapse = TRUE,
  comment = "#>"
)
```


### Streaming results

The `chat()` method does not return any results until the entire response is received. (It can _print_ the streaming results to the console but it _returns_ the result only when the response is complete.)

If you want to process the response as it arrives, you can use the `stream()` method. This is useful when you want to send the response, in realtime, somewhere other than the R console (e.g., to a file, an HTTP response, or a Shiny chat window), or when you want to manipulate the response before displaying it without giving up the immediacy of streaming.

With the `stream()` method, which returns a [coro](https://coro.r-lib.org/) [generator](https://coro.r-lib.org/articles/generator.html), you can process the response by looping over it as it arrives.

```{r eval=FALSE}
stream <- chat$stream("What are some common uses of R?")
coro::loop(for (chunk in stream) {
  cat(toupper(chunk))
})
#>  R IS COMMONLY USED FOR:
#>
#>  1. **STATISTICAL ANALYSIS**: PERFORMING COMPLEX STATISTICAL TESTS AND ANALYSES.
#>  2. **DATA VISUALIZATION**: CREATING GRAPHS, CHARTS, AND PLOTS USING PACKAGES LIKE  GGPLOT2.
#>  3. **DATA MANIPULATION**: CLEANING AND TRANSFORMING DATA WITH PACKAGES LIKE DPLYR AND TIDYR.
#>  4. **MACHINE LEARNING**: BUILDING PREDICTIVE MODELS WITH LIBRARIES LIKE CARET AND #>  RANDOMFOREST.
#>  5. **BIOINFORMATICS**: ANALYZING BIOLOGICAL DATA AND GENOMIC STUDIES.
#>  6. **ECONOMETRICS**: PERFORMING ECONOMIC DATA ANALYSIS AND MODELING.
#>  7. **REPORTING**: GENERATING DYNAMIC REPORTS AND DASHBOARDS WITH R MARKDOWN.
#>  8. **TIME SERIES ANALYSIS**: ANALYZING TEMPORAL DATA AND FORECASTING.
#>
#>  THESE USES MAKE R A POWERFUL TOOL FOR DATA SCIENTISTS, STATISTICIANS, AND RESEARCHERS.
```

## Async usage

ellmer also supports async usage. This is useful when you want to run multiple, concurrent chat sessions. This is particularly important for Shiny applications where using the methods described above would block the Shiny app for other users for the duration of each response.

To use async chat, call `chat_async()`/`stream_async()` instead of `chat()`/`stream()`. The `_async` variants take the same arguments for construction but return a promise instead of the actual response.

Remember that chat objects are stateful; they preserve the conversation history as you interact with it. This means that it doesn't make sense to issue multiple, concurrent chat/stream operations on the same chat object because the conversation history can become corrupted with interleaved conversation fragments. If you need to run concurrent chat sessions, create multiple chat objects.

### Asynchronous chat

For asynchronous, non-streaming chat, you'd use the `chat()` method as before, but handle the result as a promise instead of a string.

```{r eval=FALSE}
library(promises)

chat$chat_async("How's your day going?") %...>% print()
#> I'm just a computer program, so I don't have feelings, but I'm here to help you with any questions you have.
```

TODO: Shiny example

### Asynchronous streaming

For asynchronous streaming, you'd use the `stream()` method as before, but the result is an [async generator](https://coro.r-lib.org/reference/async_generator.html) from the [coro package](https://coro.r-lib.org/). This is the same as a regular [generator](https://coro.r-lib.org/articles/generator.html), except that instead of giving you strings, it gives you promises that resolve to strings.

```{r eval=FALSE}
stream <- chat$stream_async("What are some common uses of R?")
coro::async(function() {
  for (chunk in await_each(stream)) {
    cat(toupper(chunk))
  }
})()
#>  R IS COMMONLY USED FOR:
#>
#>  1. **STATISTICAL ANALYSIS**: PERFORMING VARIOUS STATISTICAL TESTS AND MODELS.
#>  2. **DATA VISUALIZATION**: CREATING PLOTS AND GRAPHS TO VISUALIZE DATA.
#>  3. **DATA MANIPULATION**: CLEANING AND TRANSFORMING DATA WITH PACKAGES LIKE DPLYR.
#>  4. **MACHINE LEARNING**: BUILDING PREDICTIVE MODELS AND ALGORITHMS.
#>  5. **BIOINFORMATICS**: ANALYZING BIOLOGICAL DATA, ESPECIALLY IN GENOMICS.
#>  6. **TIME SERIES ANALYSIS**: ANALYZING TEMPORAL DATA FOR TRENDS AND FORECASTS.
#>  7. **REPORT GENERATION**: CREATING DYNAMIC REPORTS WITH R MARKDOWN.
#>  8. **GEOSPATIAL ANALYSIS**: MAPPING AND ANALYZING GEOGRAPHIC DATA.
```

Async generators are very advanced and require a good understanding of asynchronous programming in R. They are also the only way to present streaming results in Shiny without blocking other users. Fortunately, Shiny will soon have chat components that will make this easier, where you'll simply hand the result of `stream_async()` to a chat output.
</file>

<file path="vignettes/tool-calling.Rmd">
---
title: "Tool/function calling"
output: rmarkdown::html_vignette
vignette: >
  %\VignetteIndexEntry{Tool/function calling}
  %\VignetteEngine{knitr::rmarkdown}
  %\VignetteEncoding{UTF-8}
---

```{r, include = FALSE}
knitr::opts_chunk$set(
  collapse = TRUE,
  comment = "#>",
  eval = ellmer:::openai_key_exists()
)
```

## Introduction

One of the most interesting aspects of modern chat models is their ability to make use of external tools that are defined by the caller.

When making a chat request to the chat model, the caller advertises one or more tools (defined by their function name, description, and a list of expected arguments), and the chat model can choose to respond with one or more "tool calls". These tool calls are requests *from the chat model to the caller* to execute the function with the given arguments; the caller is expected to execute the functions and "return" the results by submitting another chat request with the conversation so far, plus the results. The chat model can then use those results in formulating its response, or, it may decide to make additional tool calls.

*Note that the chat model does not directly execute any external tools!* It only makes requests for the caller to execute them. It's easy to think that tool calling might work like this:

![Diagram showing showing the wrong mental model of tool calls: a user initiates a request that flows to the assistant, which then runs the code, and returns the result back to the user."](tool-calling-wrong.svg)

But in fact it works like this:

![Diagram showing the correct mental model for tool calls: a user sends a request that needs a tool call, the assistant request that the user's runs that tool, returns the result to the assistant, which uses it to generate the final answer.](tool-calling-right.svg)

The value that the chat model brings is not in helping with execution, but with knowing when it makes sense to call a tool, what values to pass as arguments, and how to use the results in formulating its response.

```{r setup}
library(ellmer)
```

### Motivating example

Let's take a look at an example where we really need an external tool. Chat models generally do not know the current time, which makes questions like these impossible.

```{r eval=FALSE}
chat <- chat_openai(model = "gpt-4o")
chat$chat("How long ago exactly was the moment Neil Armstrong touched down on the moon?")
#> Neil Armstrong touched down on the moon on July 20, 1969, at 20:17 UTC. To determine how long ago that
#> was from the current year of 2023, we can calculate the difference in years, months, and days.
#>
#> From July 20, 1969, to July 20, 2023, is exactly 54 years. If today's date is after July 20, 2023, you
#> would add the additional time since then. If it is before, you would consider slightly less than 54
#> years.
#>
#> As of right now, can you confirm the current date so we can calculate the precise duration?
```

Unfortunately, this example was run on September 18, 2024. Let's give the chat model the ability to determine the current time and try again.

### Defining a tool function

The first thing we'll do is define an R function that returns the current time. This will be our tool.

```{r}
#' Gets the current time in the given time zone.
#'
#' @param tz The time zone to get the current time in.
#' @return The current time in the given time zone.
get_current_time <- function(tz = "UTC") {
  format(Sys.time(), tz = tz, usetz = TRUE)
}
```

Note that we've gone through the trouble of creating [roxygen2 comments](https://roxygen2.r-lib.org/). This is a very important step that will help the model use your tool correctly!

Let's test it:

```{r eval=FALSE}
get_current_time()
#> [1] "2024-09-18 17:47:14 UTC"
```

### Registering tools

Now we need to tell our chat object about our `get_current_time` function. This by creating and registering a tool:

```{r}
chat <- chat_openai(model = "gpt-4o")

chat$register_tool(tool(
  get_current_time,
  "Gets the current time in the given time zone.",
  tz = type_string(
    "The time zone to get the current time in. Defaults to `\"UTC\"`.",
    required = FALSE
  )
))
```

This is a fair amount of code to write, even for such a simple function as `get_current_time`. Fortunately, you don't have to write this by hand! I generated the above `register_tool` call by calling `create_tool_def(get_current_time)`, which printed that code at the console. `create_tool_def()` works by passing the function's signature and documentation to GPT-4o, and asking it to generate the `register_tool` call for you.

Note that `create_tool_def()` may not create perfect results, so you must review the generated code before using it. But it is a huge time-saver nonetheless, and removes the tedious boilerplate generation you'd have to do otherwise.

### Using the tool

That's all we need to do! Let's retry our query:

```{r eval=FALSE}
chat$chat("How long ago exactly was the moment Neil Armstrong touched down on the moon?")
#> Neil Armstrong touched down on the moon on July 20, 1969, at 20:17 UTC.
#>
#> To calculate the time elapsed from that moment until the current time (September 18, 2024, 17:47:19
#> UTC), we need to break it down.
#>
#> 1. From July 20, 1969, 20:17 UTC to July 20, 2024, 20:17 UTC is exactly 55 years.
#> 2. From July 20, 2024, 20:17 UTC to September 18, 2024, 17:47:19 UTC, we need to further break down:
#>
#>    - From July 20, 2024, 20:17 UTC to September 18, 2024, 17:47:19 UTC, which is:
#>      - 1 full month (August)
#>      - 30 – 20 = 10 days of July
#>      - 18 days of September until 17:47:19 UTC
#>
#> So, in detail:
#>    - 55 years
#>    - 1 month
#>    - 28 days
#>    - From July 20, 2024, 20:17 UTC to July 20, 2024, 17:47:19 UTC: 23 hours, 30 minutes, and 19 seconds
#>
#> Time Total:
#> - 55 years
#> - 1 month
#> - 28 days
#> - 23 hours
#> - 30 minutes
#> - 19 seconds
#>
#> This is the exact time that has elapsed since Neil Armstrong's historic touchdown on the moon.
```

That's correct! Without any further guidance, the chat model decided to call our tool function and successfully used its result in formulating its response.

(Full disclosure: I originally tried this example with the default model of `gpt-4o-mini` and it got the tool calling right but the date math wrong, hence the explicit `model="gpt-4o"`.)

This tool example was extremely simple, but you can imagine doing much more interesting things from tool functions: calling APIs, reading from or writing to a database, kicking off a complex simulation, or even calling a complementary GenAI model (like an image generator). Or if you are using ellmer in a Shiny app, you could use tools to set reactive values, setting off a chain of reactive updates.

### Tool limitations

Remember that tool arguments come from the chat model, and tool results are returned to the chat model. That means that only simple, {jsonlite} compatible data types can be used as inputs and outputs. It's highly recommended that you stick to strings/character, numbers, booleans/logical, null, and named or unnamed lists of those types. And you can forget about using functions, environments, external pointers, R6 classes, and other complex R objects as arguments or return values. Returning data frames seems to work OK, although be careful not to return too much data, as it all counts as tokens (i.e., they count against your context window limit and also cost you money).
</file>

<file path="vignettes/ellmer.Rmd">
---
title: "Getting started with ellmer"
output: rmarkdown::html_vignette
vignette: >
  %\VignetteIndexEntry{Getting started with ellmer}
  %\VignetteEngine{knitr::rmarkdown}
  %\VignetteEncoding{UTF-8}
---

```{r, include = FALSE}
knitr::opts_chunk$set(
  collapse = TRUE,
  eval = ellmer:::openai_key_exists(),
  comment = "#>"
)
```

```{r setup}
library(ellmer)
```

ellmer makes it easy to access the wealth of large language models (LLMs) from R. But what can you do with those models once you have access to them? This vignette will give you the basic vocabulary you need to use an LLM effectively and will show you some examples to ignite your creativity.

In this vignette we'll mostly ignore how LLMs work, using them as convenient black boxes. If you want to get a sense of how they actually work, we recommend watching Jeremy Howard's posit::conf(2023) keynote: [A hacker's guide to open source LLMs](https://www.youtube.com/watch?v=sYliwvml9Es).

## Vocabulary

We'll start by laying out the key vocab that you'll need to understand LLMs. Unfortunately the vocab is all a little entangled: to understand one term you'll often have to know a little about some of the others. So we'll start with some simple definitions of the most important terms then iteratively go a little deeper.

It all starts with a **prompt**, which is the text (typically a question or a request) that you send to the LLM. This starts a **conversation**, a sequence of turns that alternate between user prompts and model responses. Inside the model, both the prompt and response are represented by a sequence of **tokens**, which represent either individual words or subcomponents of a word. The tokens are used to compute the cost of using a model and to measure the size of the **context**, the combination of the current prompt and any previous prompts and responses used to generate the next response.

It's useful to make the distinction between providers and models. A **provider** is a web API that gives access to one or more **models**. The distinction is a bit subtle because providers are often synonymous with a model, like OpenAI and GPT, Anthropic and Claude, and Google and Gemini. But other providers, like Ollama, can host many different models, typically open source models like LLaMa and Mistral. Still other providers support both open and closed models, typically by partnering with a company that provides a popular closed model. For example, Azure OpenAI offers both open source models and OpenAI's GPT, while AWS Bedrock offers both open source models and Anthropic's Claude.

### What is a token?

An LLM is a _model_, and like all models needs some way to represent its inputs numerically. For LLMs, that means we need some way to convert words to numbers. This is the goal of the **tokenizer**. For example, using the GPT 4o tokenizer, the string "When was R created?" is converted to 5 tokens: 5958 ("When"), 673 (" was"), 460 (" R"), 5371 (" created"), 30 ("?"). As you can see, many simple strings can be represented by a single token. But more complex strings require multiple tokens. For example, the string "counterrevolutionary" requires 4 tokens: 32128 ("counter"), 264 ("re"), 9477 ("volution"), 815 ("ary"). (You can see how various strings are tokenized at <http://tiktokenizer.vercel.app/>).

It's important to have a rough sense of how text is converted to tokens because tokens are used to determine the cost of a model and how much context can be used to predict the next response. On average an English word needs ~1.5 tokens so a page might require 375-400 tokens and a complete book might require 75,000 to 150,000 tokens. Other languages will typically require more tokens, because (in brief) LLMs are trained on data from the internet, which is primarily in English.

LLMs are priced per million tokens. State of the art models (like GPT-4o or Claude 3.5 sonnet) cost $2-3 per million input tokens, and $10-15 per million output tokens. Cheaper models can cost much less, e.g. GPT-4o mini costs $0.15 per million input tokens and $0.60 per million output tokens. Even $10 of API credit will give you a lot of room for experimentation, particularly with cheaper models, and prices are likely to decline as model performance improves.

Tokens also used to measure the context window, which is how much text the LLM can use to generate the next response. As we'll discuss shortly, the context length includes the full state of your conversation so far (both your prompts and the model's responses), which means that cost grow rapidly with the number of conversational turns.

In ellmer, you can see how many tokens a conversations has used by printing it, and you can see total usage for a session with `token_usage()`.

```{r}
chat <- chat_openai(model = "gpt-4o")
. <- chat$chat("Who created R?", echo = FALSE)
chat

token_usage()
```

If you want to learn more about tokens and tokenizers, I'd recommend watching the first 20-30 minutes of [Let's build the GPT Tokenizer](https://www.youtube.com/watch?v=zduSFxRajkE) by Andrej Karpathy. You certainly don't need to learn how to build your own tokenizer, but the intro will give you a bunch of useful background knowledge that will help improve your undersstanding of how LLM's work.

### What is a conversation?

A conversation with an LLM takes place through a series of HTTP requests and responses: you send your question to the LLM as an HTTP request, and it sends back its reply as an HTTP response. In other words, a conversation consists of a sequence of a paired turns: a sent prompt and a returned response.

It's important to note that a request includes not only the current user prompt, but every previous user prompt and model response. This means that:

* The cost of a conversation grows quadratically with the number of turns: if you want to save money, keep your conversations short.

* Each response is affected by all previous prompts and responses. This can make a converstion get stuck in a local optimum, so it's generally better to iterate by starting a new conversation with a better prompt rather than having a long back-and-forth.

* ellmer has full control over the conversational history. Because it's ellmer's responsibility to send the previous turns of the conversation, it's possible to start a conversation with one model and finish it with another.

### What is a prompt?

The user prompt is the question that you send to the model. There are two other important prompts that underlie the user prompt:

* The **platform prompt**, which is unchangeable, set by the model provider, and affects every conversation. You can see what these look like from Anthropic, who [publishes their core system prompts](https://docs.anthropic.com/en/release-notes/system-prompts).

* The **system prompt** (aka developer prompt), which is set when you create a new conversation, and affects every response. It's used to provide additional instructions to the model, shaping its responses to your needs. For example, you might use the system prompt to ask the model to always respond in Spanish or to write dependency-free base R code. You can also use the system prompt to provide the model with information it wouldn't otherwise know, like the details of your database schema, or your preferred ggplot2 theme and color palette.

OpenAI calls this the [chain of command](https://cdn.openai.com/spec/model-spec-2024-05-08.html#follow-the-chain-of-command): if there are conflicts or inconsistencies the prompts, the platform prompt overrides the system prompt, which in turn overrides the user prompt.

When you use a chat app like ChatGPT or claude.ai you can only iterate on the user prompt. But when you're programming with LLMs, you'll primarily iterate on the system prompt. For example, if you're developing an app that helps a user write tidyverse code, you'd work with the system prompt to ensure that user gets the style of code they want.

Writing a good prompt, which is called __prompt design__, is key to effective use of LLMs. It is discussed in more detail in `vignette("prompt-design")`.

## Example uses

Now that you've got the basic vocab under your belt, I'm going to fire a bunch of interesting potential use cases at you. While there are special purpose tools that might solve these cases faster and/or cheaper, an LLM allows you to rapidly prototype a solution. This can be extremely valuable even if you end up using those more specialised tools in your final product.

In general, we recommend avoiding LLMs where accuracy is critical. That said, there are still many cases for their use. For example, even though they always require some manual fiddling, you might save a bunch of time ever with an 80% correct solution. In fact, even a not-so-good solution can still be useful because it makes it easier to get started: it's easier to react to something rather than to have to start from scratch with a blank page.

### Chatbots

A great place to start with ellmer and LLMs is to build a chatbot with a custom prompt. Chatbots are a familiar interface to LLMs and are easy to create in R with [shinychat](https://github.com/jcheng5/shinychat). And there's a surprising amount of value to creating a custom chatbot that has a prompt stuffed with useful knowledge. For example:

* Help people use your new package. To do so, you need a custom prompt because LLMs were trained on data prior to your package's existence. You can create a surprisingly useful tool just by preloading the prompt with your README and vignettes. This is how the [ellmer assistant](https://github.com/jcheng5/elmer-assistant) works.

* Build language specific prompts for R and/or python. [Shiny assistant](https://shiny.posit.co/blog/posts/shiny-assistant/) helps you build shiny apps (either in R or python) by combining a [prompt](https://github.com/posit-dev/shiny-assistant/blob/main/shinyapp/app_prompt.md) that gives general advice on building apps with a prompt for [R](https://github.com/posit-dev/shiny-assistant/blob/main/shinyapp/app_prompt_r.md) or [python](https://github.com/posit-dev/shiny-assistant/blob/main/shinyapp/app_prompt_python.md). The python prompt is very detailed because there's much less information about Shiny for Python in the existing LLM knowledgebases.

* Help people find the answers to their questions. Even if you've written a bunch of documentation for something, you might find that you still get questions because folks can't easily find exactly what they're looking for. You can reduce the need to answer these questions by creating a chatbot with a prompt that contains your documentation. For example, if you're a teacher, you could create a chatbot that includes your syllabus in the prompt. This eliminates a common class of question where the data necessary to answer the question is available, but hard to find.

Another direction is to give the chatbot additional context about your current environment. For example, [aidea](https://github.com/cpsievert/aidea) allows the user to interactively explore a dataset with the help of the LLM. It adds summary statistics about the dataset to the [prompt](https://github.com/cpsievert/aidea/blob/main/inst/app/prompt.md) so that the LLM knows something about your data. Along these lines, imagine writing a chatbot to help with data import that has a prompt which include all the files in the current directory along with their first few lines.

### Structured data extraction

LLMs are often very good at extracting structured data from unstructured text. This can give you traction to analyse data that was previously unaccessible. For example:

* Customer tickets and GitHub issues: you can use LLMs for quick and dirty sentiment analysis by extracting any specifically mentioned products and summarising the discussion as a few bullet points.

* Geocoding: LLMs do a surprisingly good job at geocoding, especially extracting addresses or finding the latitute/longitude of cities. There are specialised tools that do this better, but using an LLM makes it easy to get started.

* Recipes: I've extracted structured data from baking and cocktail recipes. Once you have the data in a structured form you can use your R skills to better understand how recipes vary within a cookbook or to look for recipes that use the ingredients currently in your kitchen. You could even use shiny assistant to help make those techniques available to anyone, not just R users.

Structured data extraction also works well with images. It's not the fastest or cheapest way to extract data but it makes it really easy to prototype ideas. For example, maybe you have a bunch of scanned documents that you want to index. You can convert PDFs to images (e.g. using {imagemagick}) then use structured data extraction to pull out key details.

Learn more about structured data extraction in `vignette("structure-data")`.

### Programming

LLMs can also be useful to solve general programming problems. For example:

* Write a detailed prompt that explains how to update code to use a new version of a package. You could combine this with the rstudioapi package to allow the user to select code, transform it, and replace it in the existing text. A comprehensive example of this sort of app is [chores](https://simonpcouch.github.io/chores/), which includes prompts for automatically generating roxygen documentation blocks, updating testthat code to the 3rd edition, and converting `stop()` and `abort()` to use `cli::cli_abort()`.

* You could automatically look up the documentation for an R function, and include it in the prompt to make it easier to figure out how to use a specific function.

* You can use LLMs to explain code, or even ask them to [generate a diagram](https://bsky.app/profile/daviddiviny.com/post/3lb6kjaen4c2u).

* You can ask an LLM to analyse your code for potential code smells or security issues. You can do this a function at a time, or explore the entire source code of your package or script in the prompt.

* You could use [gh](https://gh.r-lib.org) to find unlabelled issues, extract the text, and ask the LLM to figure out what labels might be most appropriate. Or maybe an LLM might be able to help people create better reprexes, or simplify reprexes that are too complicated?

* I find it useful to have an LLM document a function for me, even knowing that it's likely to be mostly incorrect. Having something to react to make it much easier for me to get started.

* If you're working with code or data from another programming language, you can ask an LLM to convert it to R code for you. Even if it's not perfect, it's still typically much faster than doing everything yourself.

## Miscellaneous

To finish up here are a few other ideas that seem cool but didn't seem to fit the above categories:

* Automatically generate alt text for plots, using `content_image_plot()`.

* Analyse the text of your statistical report to look for flaws in your statistical reasoning (e.g. misinterpreting p-values or assuming causation where only correlation exists).

* Use your existing company style guide to generate a [brand.yaml](https://posit-dev.github.io/brand-yml/articles/llm-brand-yml-prompt/) specification to automatically style your reports, apps, dashboards and plots to match your corporate style guide.
</file>

<file path="vignettes/prompt-design.Rmd">
---
title: "Prompt design"
output: rmarkdown::html_vignette
vignette: >
  %\VignetteIndexEntry{Prompt design}
  %\VignetteEngine{knitr::rmarkdown}
  %\VignetteEncoding{UTF-8}
---

```{r, include = FALSE}
knitr::opts_chunk$set(
  collapse = TRUE,
  comment = "#>",
  eval = ellmer:::openai_key_exists() && ellmer:::anthropic_key_exists(),
  cache = TRUE
)
options(ellmer_seed = 1337)
```

This vignette gives you some advice about how to use ellmer to write prompts. We'll work through two hopefully relevant examples: a prompt that generates code and another that extracts structured data. If you've never written a prompt, I'd highly recommend reading Ethan Mollick's [Getting started with AI: Good enough prompting](https://www.oneusefulthing.org/p/getting-started-with-ai-good-enough). I think understanding his analogy about how AI works will really help you get started:

> Treat AI like an infinitely patient new coworker who forgets everything you tell them each new conversation, one that comes highly recommended but whose actual abilities are not that clear. ... Two parts of this are analogous to working with humans (being new on the job and being a coworker) and two of them are very alien (forgetting everything and being infinitely patient). We should start with where AIs are closest to humans, because that is the key to good-enough prompting

As well as learning general prompt design skills, it's also a good idea to read any specific advice for the model that you're using. Here are some pointers to the prompt design guides of some of the most popular models:

* [Claude](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview)
* [OpenAI](https://platform.openai.com/docs/guides/prompt-engineering)
* [Gemini](https://ai.google.dev/gemini-api/docs/prompting-intro)

If you have a claude account, you can use its [prompt-generator](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/prompt-generator). It's specifically tailored for Claude, but I suspect it will help you with many other LLMs, or at least give you some ideas as to what else to include in your prompt.

```{r setup}
#| cache: false
library(ellmer)
```

```{r}
#| include: false
# Manually ratchet claude variability way down to hopefully make generated
# code better match my prose.
chat_anthropic <- function(...) {
  ellmer::chat_anthropic(..., params = params(temperature = 0))
}
```

## Best practices

It's highly likely that you'll end up writing long, possibly multi-page prompts. To ensure your success with this task, we have two recommendations. First, put each prompt its own, separate file. Second, write the prompts using markdown. The reason to use markdown is that it's quite readable to LLMs (and humans), and it allows you to do things like use headers to divide up a prompt into sections and itemised lists to enumerate multiple options. You can see some examples of this style of prompt here:

* <https://github.com/posit-dev/shiny-assistant/blob/main/shinyapp/app_prompt_python.md>
* <https://github.com/jcheng5/py-sidebot/blob/main/prompt.md>
* <https://github.com/simonpcouch/pal/tree/main/inst/prompts>
* <https://github.com/cpsievert/aidea/blob/main/inst/app/prompt.md>

In terms of file names, if you only have one prompt in your project, call it `prompt.md`. If you have multiple prompts, give them informative names like `prompt-extract-metadata.md` or `prompt-summarize-text.md`. If you're writing a package, put your prompt(s) in `inst/prompts`, otherwise it's fine to put them in the project's root directory.

Your prompts are going to change over time, so we'd highly recommend commiting them to a git repo. That will ensure that you can easily see what has changed, and that if you accidentally make a mistake you can easily roll back to a known good verison.

If your prompt includes dynamic data, use `ellmer::interpolate_file()` to intergrate it into your prompt. `interpolate_file()` works like [glue](https://glue.tidyverse.org) but uses `{{ "{{ }}" }}` instead of `{ }` to make it easier to work with JSON.

As you iterate the prompt, it's a good idea to build up a small set of challenging examples that you can regularly re-check with your latest version of the prompt. Currently you'll need to do this by hand, but we hope to eventually provide tools that'll help you do this a little more formally.

Unfortunately, you won't see these best practices in action in this vignette since we're keeping the prompts short and inline to make it easier for you to grok what's going on.

## Code generation

Let's explore prompt design for a simple code generation task:

```{r}
#| cache: false
question <- "
  How can I compute the mean and median of variables a, b, c, and so on,
  all the way up to z, grouped by age and sex.
"
```

I'll use `chat_anthropic()` for this problem because in our experience it does the best job of generating code.

### Basic flavour

When I don't provide a system prompt, I sometimes get answers in different languages or different styles of R code:

```{r}
#| label: code-basic
chat <- chat_anthropic()
chat$chat(question)
```

I can ensure that I always get R code in a specific style by providing a system prompt:

```{r}
#| label: code-r
chat <- chat_anthropic(
  system_prompt = "
  You are an expert R programmer who prefers the tidyverse.
"
)
chat$chat(question)
```

Note that I'm using both a system prompt (which defines the general behaviour) and a user prompt (which asks the specific question). You could put all this content in the user prompt and get similar results, but I think it's helpful to use both to cleanly divide the general framing of the response from the specific questions you ask.

Since I'm mostly interested in the code, I ask it to drop the explanation and sample data:

```{r}
#| label: code-r-minimal
chat <- chat_anthropic(
  system_prompt = "
  You are an expert R programmer who prefers the tidyverse.
  Just give me the code. I don't want any explanation or sample data.
"
)
chat$chat(question)
```

And of course, if you want a different style of R code, just ask for it:

```{r}
#| label: code-styles
chat <- chat_anthropic(
  system_prompt = "
  You are an expert R programmer who prefers data.table.
  Just give me the code. I don't want any explanation or sample data.
"
)
chat$chat(question)

chat <- chat_anthropic(
  system_prompt = "
  You are an expert R programmer who prefers base R.
  Just give me the code. I don't want any explanation or sample data.
"
)
chat$chat(question)
```

### Be explicit

If there's something about the output that you don't like, try being more explicit. For example, the code isn't styled quite how I'd like it, so I provide more details about what I do want:

```{r}
#| label: code-explicit
chat <- chat_anthropic(
  system_prompt = "
  You are an expert R programmer who prefers the tidyverse.
  Just give me the code. I don't want any explanation or sample data.

  Follow the tidyverse style guide:
  * Spread long function calls across multiple lines.
  * Where needed, always indent function calls with two spaces.
  * Only name arguments that are less commonly used.
  * Always use double quotes for strings.
  * Use the base pipe, `|>`, not the magrittr pipe `%>%`.
"
)
chat$chat(question)
```

This still doesn't yield exactly the code that I'd write, but it's pretty close.

You could provide a different prompt if you were looking for more explanation of the code:

```{r}
#| label: code-teacher
chat <- chat_anthropic(
  system_prompt = "
  You are an expert R teacher.
  I am a new R user who wants to improve my programming skills.
  Help me understand the code you produce by explaining each function call with
  a brief comment. For more complicated calls, add documentation to each
  argument. Just give me the code. I don't want any explanation or sample data.
"
)
chat$chat(question)
```

### Teach it about new features

You can imagine LLMs as being a sort of an average of the internet at a given point in time. That means they will provide popular answers, which will tend to reflect older coding styles (either because the new features aren't in their index, or the older features are so much more popular). So if you want your code to use specific newer language features, you might need to provide the examples yourself:

```{r}
#| label: code-new-feature
chat <- chat_anthropic(
  system_prompt = "
  You are an expert R programmer.
  Just give me the code; no explanation in text.
  Use the `.by` argument rather than `group_by()`.
  dplyr 1.1.0 introduced per-operation grouping with the `.by` argument.
  e.g., instead of:

  transactions |>
    group_by(company, year) |>
    mutate(total = sum(revenue))

  write this:
  transactions |>
    mutate(
      total = sum(revenue),
      .by = c(company, year)
    )
"
)
chat$chat(question)
```

## Structured data

Providing a rich set of examples is a great way to encourage the output to produce exactly what you want. This is known as **multi-shot prompting**. Below we'll work through a prompt that I designed to extract structured data from recipes, but the same ideas apply in many other situations.

### Getting started

My overall goal is to turn a list of ingredients, like the following, into a nicely structured JSON that I can then analyse in R (e.g. compute the total weight, scale the recipe up or down, or convert the units from volumes to weights).

```{r}
#| cache: false
ingredients <- "
  ¾ cup (150g) dark brown sugar
  2 large eggs
  ¾ cup (165g) sour cream
  ½ cup (113g) unsalted butter, melted
  1 teaspoon vanilla extract
  ¾ teaspoon kosher salt
  ⅓ cup (80ml) neutral oil
  1½ cups (190g) all-purpose flour
  150g plus 1½ teaspoons sugar
"
```

(This isn't the ingredient list for a real recipe but it includes a sampling of styles that I encountered in my project.)

If you don't have strong feelings about what the data structure should look like, you can start with a very loose prompt and see what you get back. I find this a useful pattern for underspecified problems where the heavy lifting lies with precisely defining the problem you want to solve. Seeing the LLM's attempt to create a data structure gives me something to react to, rather than having to start from a blank page.

```{r}
#| label: data-loose
instruct_json <- "
  You're an expert baker who also loves JSON. I am going to give you a list of
  ingredients and your job is to return nicely structured JSON. Just return the
  JSON and no other commentary.
"

chat <- chat_openai(instruct_json)
chat$chat(ingredients)
```

(I don't know if the additional colour, "You're an expert baker who also loves JSON", does anything, but I like to think this helps the LLM get into the right mindset of a very nerdy baker.)

### Provide examples

This isn't a bad start, but I prefer to cook with weight and I only want to see volumes if weight isn't available so I provide a couple of examples of what I'm looking for. I was pleasantly suprised that I can provide the input and output examples in such a loose format.

```{r}
#| label: data-examples
instruct_weight <- r"(
  Here are some examples of the sort of output I'm looking for:

  ¾ cup (150g) dark brown sugar
  {"name": "dark brown sugar", "quantity": 150, "unit": "g"}

  ⅓ cup (80ml) neutral oil
  {"name": "neutral oil", "quantity": 80, "unit": "ml"}

  2 t ground cinnamon
  {"name": "ground cinnamon", "quantity": 2, "unit": "teaspoon"}
)"

chat <- chat_openai(paste(instruct_json, instruct_weight))
chat$chat(ingredients)
```

Just providing the examples seems to work remarkably well. But I found it useful to also include a description of what the examples are trying to accomplish. I'm not sure if this helps the LLM or not, but it certainly makes it easier for me to understand the organisation of the whole prompt and check that I've covered the key pieces I'm interested in.

```{r}
#| cache: false
instruct_weight <- r"(
  * If an ingredient has both weight and volume, extract only the weight:

  ¾ cup (150g) dark brown sugar
  [
    {"name": "dark brown sugar", "quantity": 150, "unit": "g"}
  ]

* If an ingredient only lists a volume, extract that.

  2 t ground cinnamon
  ⅓ cup (80ml) neutral oil
  [
    {"name": "ground cinnamon", "quantity": 2, "unit": "teaspoon"},
    {"name": "neutral oil", "quantity": 80, "unit": "ml"}
  ]
)"
```

This structure also allows me to give the LLMs a hint about how I want multiple ingredients to be stored, i.e. as an JSON array.

I then iterated on the prompt, looking at the results from different recipes to get a sense of what the LLM was getting wrong. Much of this felt like I waws iterating on my own understanding of the problem as I didn't start by knowing exactly how I wanted the data. For example, when I started out I didn't really think about all the various ways that ingredients are specified. For later analysis, I always want quantities to be number, even if they were originally fractions, or the if the units aren't precise (like a pinch). It made me realise that some ingredients are unitless.

```{r}
#| cache: false
instruct_unit <- r"(
* If the unit uses a fraction, convert it to a decimal.

  ⅓ cup sugar
  ½ teaspoon salt
  [
    {"name": "dark brown sugar", "quantity": 0.33, "unit": "cup"},
    {"name": "salt", "quantity": 0.5, "unit": "teaspoon"}
  ]

* Quantities are always numbers

  pinch of kosher salt
  [
    {"name": "kosher salt", "quantity": 1, "unit": "pinch"}
  ]

* Some ingredients don't have a unit.
  2 eggs
  1 lime
  1 apple
  [
    {"name": "egg", "quantity": 2},
    {"name": "lime", "quantity": 1},
    {"name", "apple", "quantity": 1}
  ]
)"
```

You might want to take a look at the [full prompt](https://gist.github.com/hadley/7688b4dd1e5e97b800c6d7d79e437b48) to see what I ended up with.

### Structured data

Now that I've iterated to get a data structure I like, it seems useful to formalise it and tell the LLM exactly what I'm looking for when dealing with structured data. This guarantees that the LLM will only return JSON, that the JSON will have the fields that you expect, and that ellmer will convert it into an R data structure.

```{r}
#| label: data-structured
type_ingredient <- type_object(
  name = type_string("Ingredient name"),
  quantity = type_number(),
  unit = type_string("Unit of measurement")
)

type_ingredients <- type_array(items = type_ingredient)

chat <- chat_openai(c(instruct_json, instruct_weight))
chat$extract_data(ingredients, type = type_ingredients)
```

### Capturing raw input

One thing that I'd do next time would also be to include the raw ingredient names in the output. This doesn't make much difference in this simple example but it makes it much easier to align the input with the output and to start developing automated measures of how well my prompt is doing.

```{r}
#| cache: false
instruct_weight_input <- r"(
  * If an ingredient has both weight and volume, extract only the weight:

    ¾ cup (150g) dark brown sugar
    [
      {"name": "dark brown sugar", "quantity": 150, "unit": "g", "input": "¾ cup (150g) dark brown sugar"}
    ]

  * If an ingredient only lists a volume, extract that.

    2 t ground cinnamon
    ⅓ cup (80ml) neutral oil
    [
      {"name": "ground cinnamon", "quantity": 2, "unit": "teaspoon", "input": "2 t ground cinnamon"},
      {"name": "neutral oil", "quantity": 80, "unit": "ml", "input": "⅓ cup (80ml) neutral oil"}
    ]
)"
```

I think this is particularly important if you're working with even less structured text. For example, imagine you had this text:

```{r}
#| cache: false
recipe <- r"(
  In a large bowl, cream together one cup of softened unsalted butter and a
  quarter cup of white sugar until smooth. Beat in an egg and 1 teaspoon of
  vanilla extract. Gradually stir in 2 cups of all-purpose flour until the
  dough forms. Finally, fold in 1 cup of semisweet chocolate chips. Drop
  spoonfuls of dough onto an ungreased baking sheet and bake at 350°F (175°C)
  for 10-12 minutes, or until the edges are lightly browned. Let the cookies
  cool on the baking sheet for a few minutes before transferring to a wire
  rack to cool completely. Enjoy!
)"
```

Including the input text in the output makes it easier to see if it's doing a good job:

```{r}
#| label: data-unstructured-input
chat <- chat_openai(c(instruct_json, instruct_weight_input))
chat$chat(recipe)
```

When I ran it while writing this vignette, it seemed to be working out the weight of the ingredients specified in volume, even though the prompt specifically asks it not to. This may suggest I need to broaden my examples.

## Token usage

```{r}
#| label: usage
#| type: asis
#| echo: false
knitr::kable(token_usage())
```
</file>

<file path="vignettes/structured-data.Rmd">
---
title: "Structured data"
output: rmarkdown::html_vignette
vignette: >
  %\VignetteIndexEntry{Structured data}
  %\VignetteEngine{knitr::rmarkdown}
  %\VignetteEncoding{UTF-8}
---

```{r, include = FALSE}
knitr::opts_chunk$set(
  collapse = TRUE,
  comment = "#>",
  eval = ellmer:::openai_key_exists(),
  cache = TRUE
)
```

When using an LLM to extract data from text or images, you can ask the chatbot to format it in JSON or any other format that you like. This works well most of the time, but there's no guarantee that you'll get the exact format you want. In particular, if you're trying to get JSON, you'll find that it's typically surrounded in ```` ```json ````, and you'll occasionally get text that isn't valid JSON. To avoid these problems, you can use a recent LLM feature: **structured data** (aka structured output). With structured data, you supply the type specification that defines the object structure you want and the LLM ensures that's what you'll get back.

```{r setup}
#| cache: false
library(ellmer)
```

## Structured data basics

To extract structured data you call the `$extract_data()` method instead of the `$chat()` method. You'll also need to define a type specification that describes the structure of the data that you want (more on that shortly). Here's a simple example that extracts two specific values from a string:

```{r}
#| label: basics-text
chat <- chat_openai()
chat$extract_data(
  "My name is Susan and I'm 13 years old",
  type = type_object(
    age = type_number(),
    name = type_string()
  )
)
```

The same basic idea works with images too:

```{r}
#| label: basics-image
chat$extract_data(
  content_image_url("https://www.r-project.org/Rlogo.png"),
  type = type_object(
    primary_shape = type_string(),
    primary_colour = type_string()
  )
)
```

## Data types basics

To define your desired type specification (also known as a **schema**), you use the `type_()` functions. (You might already be familiar with these if you've done any function calling, as discussed in `vignette("function-calling")`). The type functions can be divided into three main groups:

* **Scalars** represent five types of single values, `type_boolean()`, `type_integer()`, `type_number()`, `type_string()`, and `type_enum()`, which represent a single logical, integer, double, string, and factor value respectively.

* **Arrays** represent any number of values of the same type. They are created with `type_array()`. You must always supply the `item` argument which specifies the type for each individual element. Arrays of scalars are very similar to R's atomic vectors:

  ```{r}
  #| cache: false
  type_logical_vector <- type_array(items = type_boolean())
  type_integer_vector <- type_array(items = type_integer())
  type_double_vector <- type_array(items = type_number())
  type_character_vector <- type_array(items = type_string())
  ```

  You can also have arrays of arrays and arrays of objects, which more closely resemble lists with well defined structures:

  ```{r}
  #| cache: false
  list_of_integers <- type_array(items = type_integer_vector)
  ```

* **Objects** represent a collection of named values. They are created with `type_object()`. Objects can contain any number of scalars, arrays, and other objects. They are similar to named lists in R.

  ```{r}
  #| cache: false
  type_person <- type_object(
    name = type_string(),
    age = type_integer(),
    hobbies = type_array(items = type_string())
  )
  ```

Using these type specifications ensures that the LLM will return JSON. But ellmer goes one step further to convert the results to the closest R analog. Currently, this converts arrays of boolean, integers, numbers, and strings into logical, integer, numeric, and character vectors. Arrays of objects are converted into data frames. You can opt-out of this and get plain lists by setting `convert = FALSE` in `$extract_data()`.

In addition to defining types, you need to provide the LLM with some information about what you actually want. This is the purpose of the first argument, `description`, which is a string that describes the data that you want. This is a good place to ask nicely for other attributes you'll like the value to have (e.g. minimum or maximum values, date formats, ...). There's no guarantee that these requests will be honoured, but the LLM will usually make a best effort to do so.

```{r}
#| cache: false
type_type_person <- type_object(
  "A person",
  name = type_string("Name"),
  age = type_integer("Age, in years."),
  hobbies = type_array(
    "List of hobbies. Should be exclusive and brief.",
    items = type_string()
  )
)
```

Now we'll dive into some examples before coming back to talk more about the details of data types.

## Examples

The following examples, which are [closely inspired by the Claude documentation](https://github.com/anthropics/anthropic-cookbook/blob/main/tool_use/extracting_structured_json.ipynb), hint at some of the ways you can use structured data extraction.

### Example 1: Article summarisation

```{r}
#| label: examples-summarisation
text <- readLines(system.file("examples/third-party-testing.txt", package = "ellmer"))
# url <- "https://www.anthropic.com/news/third-party-testing"
# html <- rvest::read_html(url)
# text <- rvest::html_text2(rvest::html_element(html, "article"))

type_summary <- type_object(
  "Summary of the article.",
  author = type_string("Name of the article author"),
  topics = type_array(
    'Array of topics, e.g. ["tech", "politics"]. Should be as specific as possible, and can overlap.',
    type_string(),
  ),
  summary = type_string("Summary of the article. One or two paragraphs max"),
  coherence = type_integer("Coherence of the article's key points, 0-100 (inclusive)"),
  persuasion = type_number("Article's persuasion score, 0.0-1.0 (inclusive)")
)

chat <- chat_openai()
data <- chat$extract_data(text, type = type_summary)
cat(data$summary)

str(data)
```

### Example 2: Named entity recognition

```{r}
#| label: examples-named-entity
text <- "
  John works at Google in New York. He met with Sarah, the CEO of
  Acme Inc., last week in San Francisco.
"

type_named_entity <- type_object(
  name = type_string("The extracted entity name."),
  type = type_enum("The entity type", c("person", "location", "organization")),
  context = type_string("The context in which the entity appears in the text.")
)
type_named_entities <- type_array(items = type_named_entity)

chat <- chat_openai()
chat$extract_data(text, type = type_named_entities)
```

### Example 3: Sentiment analysis

```{r}
#| label: examples-sentiment
text <- "
  The product was okay, but the customer service was terrible. I probably
  won't buy from them again.
"

type_sentiment <- type_object(
  "Extract the sentiment scores of a given text. Sentiment scores should sum to 1.",
  positive_score = type_number("Positive sentiment score, ranging from 0.0 to 1.0."),
  negative_score = type_number("Negative sentiment score, ranging from 0.0 to 1.0."),
  neutral_score = type_number("Neutral sentiment score, ranging from 0.0 to 1.0.")
)

chat <- chat_openai()
str(chat$extract_data(text, type = type_sentiment))
```

Note that while we've asked nicely for the scores to sum 1, which they do in this example (at least when I ran the code), this is not guaranteed.

### Example 4: Text classification

```{r}
#| label: examples-classification
text <- "The new quantum computing breakthrough could revolutionize the tech industry."

type_classification <- type_array(
  "Array of classification results. The scores should sum to 1.",
  type_object(
    name = type_enum(
      "The category name",
      values = c(
        "Politics",
        "Sports",
        "Technology",
        "Entertainment",
        "Business",
        "Other"
      )
    ),
    score = type_number(
      "The classification score for the category, ranging from 0.0 to 1.0."
    )
  )
)

chat <- chat_openai()
data <- chat$extract_data(text, type = type_classification)
data
```

### Example 5: Working with unknown keys

```{r, eval = ellmer:::anthropic_key_exists()}
#| label: examples-unknown-keys
type_characteristics <- type_object(
  "All characteristics",
  .additional_properties = TRUE
)

prompt <- "
  Given a description of a character, your task is to extract all the characteristics of that character.

  <description>
  The man is tall, with a beard and a scar on his left cheek. He has a deep voice and wears a black leather jacket.
  </description>
"

chat <- chat_anthropic()
str(chat$extract_data(prompt, type = type_characteristics))
```

This example only works with Claude, not GPT or Gemini, because only Claude supports adding additional, arbitrary properties.

### Example 6: Extracting data from an image

The final example comes from [Dan Nguyen](https://gist.github.com/dannguyen/faaa56cebf30ad51108a9fe4f8db36d8) (you can see other interesting applications at that link). The goal is to extract structured data from this screenshot:

![Screenshot of schedule A: a table showing assets and "unearned" income](congressional-assets.png)

Even without any descriptions, ChatGPT does pretty well:

```{r}
#| label: examples-image
type_asset <- type_object(
  assert_name = type_string(),
  owner = type_string(),
  location = type_string(),
  asset_value_low = type_integer(),
  asset_value_high = type_integer(),
  income_type = type_string(),
  income_low = type_integer(),
  income_high = type_integer(),
  tx_gt_1000 = type_boolean()
)
type_assets <- type_array(items = type_asset)

chat <- chat_openai()
image <- content_image_file("congressional-assets.png")
data <- chat$extract_data(image, type = type_assets)
data
```

## Advanced data types

Now that you've seen a few examples, it's time to get into more specifics about data type declarations.

### Required vs optional

By default, all components of an object are required. If you want to make some optional, set `required = FALSE`. This is a good idea if you don't think your text will always contain the required fields as LLMs may hallucinate data in order to fulfill your spec.

For example, here the LLM hallucinates a date even though there isn't one in the text:

```{r}
#| label: type-required
type_article <- type_object(
  "Information about an article written in markdown",
  title = type_string("Article title"),
  author = type_string("Name of the author"),
  date = type_string("Date written in YYYY-MM-DD format.")
)

prompt <- "
  Extract data from the following text:

  <text>
  # Structured Data
  By Hadley Wickham

  When using an LLM to extract data from text or images, you can ask the chatbot to nicely format it, in JSON or any other format that you like.
  </text>
"

chat <- chat_openai()
chat$extract_data(prompt, type = type_article)
str(data)
```

Note that I've used more of an explict prompt here. For this example, I found that this generated better results and that it's a useful place to put additional instructions.

If I let the LLM know that the fields are all optional, it'll return `NULL` for the missing fields:

```{r}
#| label: type-optional
type_article <- type_object(
  "Information about an article written in markdown",
  title = type_string("Article title", required = FALSE),
  author = type_string("Name of the author", required = FALSE),
  date = type_string("Date written in YYYY-MM-DD format.", required = FALSE)
)
chat$extract_data(prompt, type = type_article)
```

### Data frames

If you want to define a data frame like object, you might be tempted to create a definition similar to what R uses: an object (i.e., a named list) containing multiple vectors (i.e., an array):

```{r}
#| cache: false
type_my_df <- type_object(
  name = type_array(items = type_string()),
  age = type_array(items = type_integer()),
  height = type_array(items = type_number()),
  weight = type_array(items = type_number())
)
```

This, however, is not quite right becuase there's no way to specify that each array should have the same length. Instead, you'll need to turn the data structure "inside out" and create an array of objects:

```{r}
#| cache: false
type_my_df <- type_array(
  items = type_object(
    name = type_string(),
    age = type_integer(),
    height = type_number(),
    weight = type_number()
  )
)
```

If you're familiar with the terms row-oriented and column-oriented data frames, this is the same idea. Since most languages don't possess vectorisation like R, row-oriented structures tend to be much more common in the wild.

## Token usage

```{r}
#| label: usage
#| type: asis
#| echo: false
knitr::kable(token_usage())
```
</file>

<file path="README.md">
<!-- README.md is generated from README.Rmd. Please edit that file -->

# ellmer <a href="https://ellmer.tidyverse.org"><img src="man/figures/logo.png" align="right" height="138" alt="ellmer website" /></a>

<!-- badges: start -->

[![Lifecycle:
experimental](https://img.shields.io/badge/lifecycle-experimental-orange.svg)](https://lifecycle.r-lib.org/articles/stages.html#experimental)
[![R-CMD-check](https://github.com/tidyverse/ellmer/actions/workflows/R-CMD-check.yaml/badge.svg)](https://github.com/tidyverse/ellmer/actions/workflows/R-CMD-check.yaml)
<!-- badges: end -->

ellmer makes it easy to use large language models (LLM) from R. It
supports a wide variety of LLM providers and implements a rich set of
features including streaming outputs, tool/function calling, structured
data extraction, and more.

(Looking for something similar to ellmer for python? Check out
[chatlas](https://github.com/posit-dev/chatlas)!)

## Installation

You can install ellmer from CRAN with:

``` r
install.packages("ellmer")
```

## Providers

ellmer supports a wide variety of model providers:

- Anthropic’s Claude: `chat_anthropic()`.
- AWS Bedrock: `chat_aws_bedrock()`.
- Azure OpenAI: `chat_azure_openai()`.
- Databricks: `chat_databricks()`.
- DeepSeek: `chat_deepseek()`.
- GitHub model marketplace: `chat_github()`.
- Google Gemini: `chat_google_gemini()`.
- Groq: `chat_groq()`.
- Ollama: `chat_ollama()`.
- OpenAI: `chat_openai()`.
- OpenRouter: `chat_openrouter()`.
- perplexity.ai: `chat_perplexity()`.
- Snowflake Cortex: `chat_snowflake()` and `chat_cortex_analyst()`.
- VLLM: `chat_vllm()`.

### Provider/model choice

If you’re using ellmer inside an organisation, you may have internal
policies that limit you to models from big cloud providers,
e.g. `chat_azure_openai()`, `chat_aws_bedrock()`, `chat_databricks()`,
or `chat_snowflake()`.

If you’re using ellmer for your own exploration, you’ll have a lot more
freedom, so we have a few recommendations to help you get started:

- `chat_openai()` or `chat_anthropic()` are good places to start.
  `chat_openai()` defaults to **GPT-4o**, but you can use
  `model = "gpt-4o-mini"` for a cheaper, lower-quality model, or
  `model = "o1-mini"` for more complex reasoning. `chat_anthropic()` is
  also good; it defaults to **Claude 3.5 Sonnet**, which we have found
  to be particularly good at writing code.

- `chat_google_gemini()` is great for large prompts because it has a
  much larger context window than other models. It allows up to 1
  million tokens, compared to Claude 3.5 Sonnet’s 200k and GPT-4o’s
  128k. It also comes with a generous free tier (with the downside that
  [your data is
  used](https://ai.google.dev/gemini-api/terms#unpaid-services) to
  improve the model).

- `chat_ollama()`, which uses [Ollama](https://ollama.com), allows you
  to run models on your own computer. While the biggest models you can
  run locally aren’t as good as the state of the art hosted models, they
  don’t share your data and are effectively free.

### Authentication

Authentication works a little differently depending on the provider. A
few popular ones (including OpenAI and Anthropic) require you to obtain
an API key. We recommend you save it in an environment variable rather
than using it directly in your code, and if you deploy an app or report
that uses ellmer to another system, you’ll need to ensure that this
environment variable is available there, too.

ellmer also automatically detects many of the OAuth or IAM-based
credentials used by the big cloud providers (currently
`chat_azure_openai()`, `chat_aws_bedrock()`, `chat_databricks()`,
`chat_snowflake()`). That includes credentials for these platforms
managed by [Posit
Workbench](https://docs.posit.co/ide/server-pro/user/posit-workbench/managed-credentials/managed-credentials.html)
and [Posit
Connect](https://docs.posit.co/connect/user/oauth-integrations/#adding-oauth-integrations-to-deployed-content).

If you find cases where ellmer cannot detect credentials from one of
these cloud providers, feel free to open an issue; we’re happy to add
more auth mechanisms if needed.

## Using ellmer

You can work with ellmer in several different ways, depending on whether
you are working interactively or programmatically. They all start with
creating a new chat object:

``` r
library(ellmer)

chat <- chat_openai(
  model = "gpt-4o-mini",
  system_prompt = "You are a friendly but terse assistant.",
)
```

Chat objects are stateful [R6 objects](https://r6.r-lib.org): they
retain the context of the conversation, so each new query builds on the
previous ones. You call their methods with `$`.

### Interactive chat console

The most interactive and least programmatic way of using ellmer is to
chat directly in your R console or browser with `live_console(chat)` or
`live_browser()`:

``` r
live_console(chat)
#> ╔════════════════════════════════════════════════════════╗
#> ║  Entering chat console. Use """ for multi-line input.  ║
#> ║  Press Ctrl+C to quit.                                 ║
#> ╚════════════════════════════════════════════════════════╝
#> >>> Who were the original creators of R?
#> R was originally created by Ross Ihaka and Robert Gentleman at the University of
#> Auckland, New Zealand.
#>
#> >>> When was that?
#> R was initially released in 1995. Development began a few years prior to that,
#> in the early 1990s.
```

Keep in mind that the chat object retains state, so when you enter the
chat console, any previous interactions with that chat object are still
part of the conversation, and any interactions you have in the chat
console will persist after you exit back to the R prompt. This is true
regardless of which chat function you use.

### Interactive method call

The second most interactive way to chat is to call the `chat()` method:

``` r
chat$chat("What preceding languages most influenced R?")
#> R was primarily influenced by the S programming language, particularly S-PLUS.
#> Other languages that had an impact include Scheme and various data analysis
#> languages.
```

If you initialize the chat object in the global environment, the `chat`
method will stream the response to the console. When the entire response
is received, it’s also (invisibly) returned as a character vector. This
is useful when you want to see the response as it arrives, but you don’t
want to enter the chat console.

If you want to ask a question about an image, you can pass one or more
additional input arguments using `content_image_file()` and/or
`content_image_url()`:

``` r
chat$chat(
  content_image_url("https://www.r-project.org/Rlogo.png"),
  "Can you explain this logo?"
)
#> The logo of R features a stylized letter "R" in blue, enclosed in an oval
#> shape that resembles the letter "O," signifying the programming language's
#> name. The design conveys a modern and professional look, reflecting its use
#> in statistical computing and data analysis. The blue color often represents
#> trust and reliability, which aligns with R's role in data science.
```

### Programmatic chat

The most programmatic way to chat is to create the chat object inside a
function. By doing so, live streaming is automatically suppressed and
`$chat()` returns the result as a string:

``` r
my_function <- function() {
  chat <- chat_openai(
    model = "gpt-4o-mini",
    system_prompt = "You are a friendly but terse assistant.",
  )
  chat$chat("Is R a functional programming language?")
}
my_function()
#> [1] "Yes, R supports functional programming concepts. It allows functions to
#> be first-class objects, supports higher-order functions, and encourages the
#> use of functions as core components of code. However, it also supports
#> procedural and object-oriented programming styles."
```

If needed, you can manually control this behaviour with the `echo`
argument. This is useful for programming with ellmer when the result is
either not intended for human consumption or when you want to process
the response before displaying it.

## Learning more

ellmer comes with a bunch of vignettes to help you learn more:

- Learn key vocabulary and see example use cases in
  `vignette("ellmer")`.
- Learn how to design your prompt in `vignette("prompt-design")`.
- Learn about tool/function calling in `vignette("tool-calling")`.
- Learn how to extract structured data in `vignette("structured-data")`.
- Learn about streaming and async APIs in `vignette("streaming-async")`.
</file>

</files>
</DOCUMENTATION>
