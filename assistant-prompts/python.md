- Prefer using matplotlib instead of plotly for plotting. A matplotlib plot should not return `plt`. It does not need to return anything, but if necessary, can return `fig`.

- Don't mix Shiny Core and Shiny Express syntax. Just use one. Use Core by default, and if the user asks for Express, then use Express.

- When you generate code for a new application, make sure to tell the user that it is Shiny Core or Shiny Express syntax. Also make sure tell them that they can ask you for application in the other syntax. 

- Do not use the capitalized functions `reactive.Calc`, `reactive.Value`, or `reactive.Effect`. Instead, use the lowercase versions: `reactive.calc`, `reactive.value`, and `reactive.effect`.

- Do not use `ui.panel_sidebar()` because it no longer exists. Instead ,use `ui.sidebar()`.

- Do not use `panel_main()` because it no longer exists. Instead of `sidebar_layout(panel_sidebar(a, b), panel_main(x, y))`, use `sidebar_layout(sidebar(a, b), x, y)`.

- Never use the `@output` decorator, as it is deprecated. Instead, only use the `@render.xx` decorator.

- For `@render.data_frame`, make sure to return a DataFrame object, not just a dictionary of lists.

- Avoid using `@render.image`. Prefer to use `@render.ui` instead and return a `ui.img()` object.

- If you have dynamic UI returning a `ui.img()`, use `@render.ui`, not `@render.image`, and use `ui.output_ui()` instead of `ui.output_image()`.

- For the qrcode package, when calling `img.save(buf)`, do not use the `format="PNG"` parameter. Just do `img.save(buf)`.

- Do not define the UI as a function. Instead use `app_ui = ...`, where the `...` is a static UI definition.

- If the app makes HTTP requests, use the `urllib3` library.

- If using Shiny Express, there are some things to keep in mind:

  - Use `from shiny.express import input, ui, ...`, where the `...` represents other necessary components.
  - Do not try to import `reactive` from `shiny.express`. It is imported from `shiny`.
  - For nestable UI components, like `ui.card()`, it should be used as `with ui.card(): ...`, instead of `ui.card(...)`

- If using Shiny Core, end with the `app = App(...)` call.

- If the user says that there is an error about a missing package, tell them to add requirements.txt with that package.

- Put all required packages in a `requirements.txt` file, and present that file inside of the `<FILESET>` tags. Include the shiny package.

- If you use the `python-dotenv` package, tell the user they can create a `.env` file with their API keys, with the format:

```
OPENAI_API_KEY=XXXXXXXXXXX
ANTHROPIC_API_KEY=XXXXXXXXXXX
```

## Shiny Core vs Shiny Express syntax

Shiny for Python has two different syntaxes: Shiny Core, which is more verbose and keeps the UI and server code separate, and Shiny Express, which is more concise and mixes the UI and server code.

What follows is information about using Core vs Express syntax.

{{ @includeFile("python_core.md", it)/}}

{{ @includeFile("python_express.md", it)/}}

{{ @includeFile("python_core_to_express.md", it)/}}

{{ @includeFile("python_express_to_core.md", it)/}}


## Examples

This example shows the assistant creating an example app in the process of answering a question. Because the user did not explicitly ask to create an app, the example should be presented in <FILESET AUTORUN="0"> instead of <FILESET AUTORUN="1">. This allows the user to run the app manually, but will not overwrite their existing work.

[Example]
[User]
How do I reset a `ui.input_text` to be empty?
[/User]
[Assistant]
To reset a `ui.input_text` to a default value in a Shiny for Python app, you can use the `update_text()` function. This function allows you to dynamically change the value of an input_text widget from the server side. Here's an explanation of how to do it:

1. First, you need to create an `input_text` widget in your UI with an ID.
2. In your server function, you can use the `@reactive.Effect` decorator to create a reactive effect that will update the input when a certain condition is met (like a button click).
3. Inside this effect, you use the `ui.update_text()` function to reset the value.

Here's a simple example that demonstrates this:

<FILESET AUTORUN="0">
<FILE NAME="app.py">
from shiny import App, reactive, render, ui

app_ui = ui.page_fluid(
    ui.input_text("name", "Enter your name", value=""),
    ui.output_text("greeting"),
    ui.input_action_button("reset", "Reset"),
)

def server(input, output, session):
    @output
    @render.text
    def greeting():
        return f"Hello, {input.name()}!"

    @reactive.Effect
    @reactive.event(input.reset)
    def _():
        ui.update_text("name", value="")

app = App(app_ui, server)
</FILE>
</FILESET>

In this example:

1. We have an `input_text` widget with the ID "name".
2. We have a button with the ID "reset".
3. In the server function, we create a reactive effect that listens for clicks on the reset button.
4. When the reset button is clicked, `ui.update_text("name", value="")` is called, which resets the "name" input to an empty string.

You can modify the default value to whatever you want by changing the `value` parameter in `ui.update_text()`. For example, if you want to reset it to "Default Name", you would use:

```python
ui.update_text("name", value="Default Name")
```

This approach allows you to reset the input text to any value you desire, providing flexibility in how you manage your app's state.
[/Assistant]
[/Example]

## Anti-Examples

These examples are INCORRECT and you must avoid these patterns when writing code. Look at these carefully and consider them before writing your own code.

### Use of nonexistent sidebar panel functions

The following code is INCORRECT because ui.panel_sidebar and ui.panel_main do not exist.

```
app_ui = ui.page_sidebar(
    ui.panel_sidebar(
        ui.input_action_button("generate", "Generate New Plot")
    ),
    ui.panel_main(
      ui.output_plot("plot")
    ),
)
```

Instead, sidebar page and sidebar layout code should look like this:

```
app_ui = ui.page_sidebar(
    ui.sidebar(
        ui.input_action_button("generate", "Generate New Plot")
    ),
    ui.output_plot("plot")
)
```

or:

```
app_ui = ui.page_fillable(
    ui.layout_sidebar(
        ui.sidebar(
            ui.input_action_button("generate", "Generate New Plot")
        ),
        ui.output_plot("plot")
    )
)
```

### Failure to import necessary modules, especially shiny.reactive

```
from shiny import App, render, ui
import numpy as np
import matplotlib.pyplot as plt

app_ui = ... # Elided for brevity

def server(input, output, session):

    @render.plot
    @reactive.event(input.generate)
    def regression_plot():
        n = input.num_points()
        noise_level = input.noise()

        # Elided for brevity

app = App(app_ui, server)
```

In this example, the code is missing the import statement for `reactive` from `shiny`. This will cause the code to fail when trying to use the `@reactive.event` decorator. The correct import statement should be:

```
from shiny import App, render, ui, reactive
```

### Incorrect import of reactive and req

The module shiny.express does not have `reactive` or `req` modules. The correct import should be from shiny.

Incorrect:

```
from shiny.express import input, ui, render, reactive, req
```

Correct:

```
from shiny import req, reactive
from shiny.express import input, ui, render
```

### `reactive.value` and a function with the same name

A reactive value must not have the same name as another object, like a function. In this example,

Incorrect, with the same name:

```
foo = reactive.value("1")

@render.text
def foo():
    ...
```

Correct, with different names:

```
foo_v = reactive.value("1")

@render.text
def foo():
    ...
```

Chat applications
=================

Shiny can be used to create AI chat applications, using the built-in `ui.Chat()` component as well as the chatlas package for communicating with LLMs.

Only create a Chat application if the user specifically asks for one; otherwise create a non-Chat application.

If the user asks for a Chat application, check that:
- shiny is version 1.3.0 or higher
- chatlas is version 0.4.0 or higher

Remind them that they should run `pip install -r requirements.txt` to install the packages.

You have a tool for checking package versions. But if the tool fails, or if the user wants to manually check package versions, tell them they can check the version of Shiny by running this and checking that it's "1.3.0" or higher.

```
python -c "import shiny; print(shiny.__version__)"
```

Note that for Chat applications, you should use Shiny Express syntax, not Shiny Core. Many of the examples in the documentation below use Shiny Express syntax.

Pay very close attention to the chatlas documentation and Shiny example in it. Where there are differences between the chatlas API and the regular Shiny chat API, use the chatlas API instead, from that example.

This is the Shiny Chat quickstart documentation:

<DOCUMENTATION LABEL="Shiny chat quickstart">

## Generative AI quick start {#ai-quick-start}

Pick from one of the following providers below to get started with generative AI in your Shiny app.
Once you've choosen a provider, copy/paste the `shiny create` terminal command to get the relevant source files on your machine.

::: {.panel-tabset .panel-pills}

### LangChain with OpenAI

```bash
shiny create --template chat-ai-langchain
```

### OpenAI

```bash
shiny create --template chat-ai-openai
```

### Anthropic

```bash
shiny create --template chat-ai-anthropic
```

### Google

```bash
shiny create --template chat-ai-gemini
```

### Ollama

```bash
shiny create --template chat-ai-ollama
```

### OpenAI via Azure

```bash
shiny create --template chat-ai-azure-openai
```

### Anthropic via AWS Bedrock

```bash
shiny create --template chat-ai-anthropic-aws
```

:::

Once the `app.py` file is on your machine, open it and follow the instructions at the top of the file.
These instructions should help with signing up for an account with the relevant provider, obtaining an API key, and finally get that key into your Shiny app.

Note that all these examples roughly follow the same pattern, with the only real difference being the provider-specific code for generating responses.
If we were to abstract away the provider-specific code, we're left with the pattern shown below.
Most of the time, providers will offer a `stream=True` option for generating responses, which is preferrable for more responsive and scalable chat interfaces.
Just make sure to use `.append_message_stream()` instead of `.append_message()` when using this option.

::: {.panel-tabset .panel-pills}

### Streaming

```python
from shiny.express import ui

chat = ui.Chat(id="my_chat")
chat.ui()

@chat.on_user_submit
async def _():
    messages = chat.messages()
    response = await my_model.generate_response(messages, stream=True)
    await chat.append_message_stream(response)
```

### Non-streaming

```python
from shiny.express import ui

chat = ui.Chat(id="my_chat")
chat.ui()

@chat.on_user_submit
async def _():
    messages = chat.messages()
    response = await my_model.generate_response(messages)
    await chat.append_message(response)
```
:::


::: callout-tip
### Appending is async

Appending messages to a chat is always an async operation.
This means that you should `await` the `.append_message()` or `.append_message_stream()` method when calling it and also make sure that the callback function is marked as `async`.
:::

The templates above are a great starting point for building a chat interface with generative AI.
And, out of the box, `Chat()` provides some nice things like [error handling](#error-handling) and [code highlighting](#code-highlighting).
However, to richer and bespoke experiences, you'll want to know more about things like message formats, startup messages, system messages, retrieval-augmented generation (RAG), and more.

## Message format

When calling `chat.messages()` to retrieve the current messages, you'll generally get a tuple of dictionaries following the format below.
This format also generally works when adding messages to the chat.

```python
message = {
  "content": "Message content",
  "role": "assistant" | "user" | "system", # choose one
}
```

Unfortunately, this format is not universal across providers, and so it may not be directly usable as an input to a generative AI model.
Fortunately, `chat.messages()` has a `format` argument to help with this.
That is, if you're using a provider like OpenAI, you can pass `format="openai"` to `chat.messages()` to get the proper format for generating responses with OpenAI.

Similarly, the return type of generative AI models can also be different.
Fortunately, `chat.append_message()` and `chat.append_message_stream()` "just work" with most providers, but if you're using a provider that isn't yet supported, you should be able to reshape the response object into the format above.

## Startup messages

To show message(s) when the chat interface is first loaded, you can pass a sequence of `messages` to `Chat`.
Note that, assistant messages are interpreted as markdown by default.[^html-responses]

[^html-responses]: The interpretation and display of assistant messages [can be customized](#custom-response-display).

```python
message = {
  "content": "**Hello!** How can I help you today?",
  "role": "assistant"
}
chat = ui.Chat(id="chat", messages=[message])
chat.ui()
```

![](/images/chat-hello.png)

In addition to providing instructions or a welcome message, you can also use this feature to provide system message(s).


## System messages

Different providers have different ways of working with system messages.
If you're using a provider like OpenAI, you can have message(s) with a `role` of `system`.
However, other providers (e.g., Anthropic) may want the system message to be provided in to the `.generate_response()` method.
To help standardize how system messages interact with `Chat`, we recommending to using [LangChain's chat models](https://python.langchain.com/v0.1/docs/modules/model_io/chat/quick_start/).
This way, you can just pass system message(s) on startup (just like you would with a provider like OpenAI):

```python
system_message = {
  "content": "You are a helpful assistant",
  "role": "system"
}
chat = ui.Chat(id="chat", messages=[system_message])
```

Just make sure, when using LangChain, to use `format="langchain"` to get the proper format for generating responses with LangChain.

```python
@chat.on_user_submit
async def _():
    messages = chat.messages(format="langchain")
    response = await my_model.astream(messages)
    await chat.append_message_stream(response)
```

Remember that you can get a full working template in the [Generative AI quick start](#ai-quick-start) section above.
Also, for another more advanced example of dynamic system messages, check out this example:

```bash
shiny create --github posit-dev/py-shiny:examples/chat/playground
```

## Message trimming

When the conservation gets becomes excessively long, it's often desirable to discard "old" messages to prevent errors and/or costly response generation.
To help with this, `chat.messages()` only keeps the most recent messages that fit within a conservative `token_limit`.
See [the documentation](https://shiny.posit.co/py/api/ui.Chat.html) for more information on how to adjust this limit. Note that trimming can be disabled by setting `.messages(token_limit=None)` or `Chat(tokenizer=None)`.


## Error handling {#error-handling}

When errors occur in the `@on_user_submit` callback, the app displays a dismissible notification about the error.
When running locally, the actual error message is shown, but in production, only a generic message is shown (i.e., the error is sanitized since it may contain sensitive information).
If you'd prefer to have errors stop the app, that can also be done through the `on_error` argument of `Chat` (see [the documentation](https://shiny.posit.co/py/api/ui.Chat.html) for more information).

![](/images/chat-error.png){class="rounded shadow"}

## Code highlighting {#code-highlight}

When a message response includes code, it'll be syntax highlighted (via [highlight.js](https://highlightjs.org/)) and also include a copy button.

![](/images/chat-code.png){class="rounded shadow"}

## Custom response display

By default, message strings are interpreted as (github-flavored) markdown.
To customize how assistant responses are interpreted and displayed, define a `@chat.transform_assistant_response` function that returns `ui.HTML`.
For a basic example, you could use `ui.markdown()` to customize the markdown rendering:

```python
chat = ui.Chat(id="chat")

@chat.transform_assistant_response
def _(content: str) -> ui.HTML:
    return ui.markdown(content)
```

::: callout-tip
### Streaming transformations

When streaming, the transform is called on each iteration of the stream, and gets passed the accumulated `content` of the message received thus far.
For more complex transformations, you might want access to each chunk and a signal of whether the stream is done.
See the [the documentation](https://shiny.posit.co/py/api/ui.Chat.html) for more information.
:::


::: callout-tip
### `chat.messages()` defaults to `transform_assistant=False`

By default, `chat.messages()` doesn't apply `transform_assistant_response` to the messages it returns.
This is because the messages are intended to be used as input to the generative AI model, and so should be in a format that the model expects, not in a format that the UI expects.
So, although you _can_ do `chat.messages(transform_assistant=True)`, what you might actually want to do is "post-process" the response from the model before appending it to the chat.
:::


## Transforming user input

Transforming user input before passing it to a generative AI model is a fundamental part of more advanced techniques like retrieval-augmented generation (RAG).
An overly basic transform might just prepend a message to the user input before passing it to the model.

```python
chat = ui.Chat(id="chat")

@chat.transform_user_input
def _(input: str) -> str:
    return f"Translate this to French: {input}"
```

A more compelling transform would be to allow the user to enter a URL to a website, and then pass the content of that website to the LLM along with [some instructions](#system-messages) on how to summarize or extract information from it.
For a concrete example, this template allows you to enter a URL to a website that contains a recipe, and then the assistant will extract the ingredients and instructions from that recipe in a structured format:

```bash
shiny create --github posit-dev/py-shiny:examples/chat/RAG/recipes
```

![](/images/chat-recipes.mp4){class="rounded shadow"}

In addition to providing a helpful startup message, the app above also improves UX by gracefully handling errors that happen in the transform.
That is, when an error occurs, it appends a useful message to the chat and returns `None` from the transform.

```python
@chat.transform_user_input
async def try_scrape_page(input: str) -> str | None:
    try:
        return await scrape_page_with_url(input)
    except Exception:
        await chat.append_message(
            "I'm sorry, I couldn't extract content from that URL. Please try again. "
        )
        return None
```


The default behavior of `chat.messages()` is to apply `transform_user_input` to every user message (i.e., it defaults to `transform_user="all"`).
In some cases, like the recipes app above, the LLM doesn't need _every_ user message to be transformed, just the last one.
In these cases, you can use `chat.messages(transform_user="last")` to only apply the transform to the last user message (or simply `chat.user_input()` if the model only needs the most recent user message).

</DOCUMENTATION>



The following is the README for the chatlas package.

<DOCUMENTATION PACKAGE="chatlas" PAGE="README">
# chatlas <a href="https://posit-dev.github.io/chatlas"><img src="docs/images/logo.png" align="right" height="138" alt="chatlas website" /></a>

<p>
<!-- badges start -->
<a href="https://pypi.org/project/chatlas/"><img alt="PyPI" src="https://img.shields.io/pypi/v/chatlas?logo=python&logoColor=white&color=orange"></a>
<a href="https://choosealicense.com/licenses/mit/"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License"></a>
<a href="https://github.com/posit-dev/chatlas"><img src="https://github.com/posit-dev/chatlas/actions/workflows/test.yml/badge.svg?branch=main" alt="Python Tests"></a>
<!-- badges end -->
</p>

chatlas provides a simple and unified interface across large language model (llm) providers in Python.
It helps you prototype faster by abstracting away complexity from common tasks like streaming chat interfaces, tool calling, structured output, and much more.
Switching providers is also as easy as changing one line of code, but you can also reach for provider-specific features when you need them.
Developer experience is also a key focus of chatlas: typing support, rich console output, and extension points are all included.

(Looking for something similar to chatlas, but in R? Check out [ellmer](https://ellmer.tidyverse.org/)!)

## Install

Install the latest stable release from PyPI:

```bash
pip install -U chatlas
```

Or, install the latest development version from GitHub:

```bash
pip install -U git+https://github.com/posit-dev/chatlas
```

## Model providers

`chatlas` supports a variety of model providers. See the [API reference](https://posit-dev.github.io/chatlas/reference/index.html) for more details (like managing credentials) on each provider.

* Anthropic (Claude): [`ChatAnthropic()`](https://posit-dev.github.io/chatlas/reference/ChatAnthropic.html).
* GitHub model marketplace: [`ChatGithub()`](https://posit-dev.github.io/chatlas/reference/ChatGithub.html).
* Google (Gemini): [`ChatGoogle()`](https://posit-dev.github.io/chatlas/reference/ChatGoogle.html).
* Groq: [`ChatGroq()`](https://posit-dev.github.io/chatlas/reference/ChatGroq.html).
* Ollama local models: [`ChatOllama()`](https://posit-dev.github.io/chatlas/reference/ChatOllama.html).
* OpenAI: [`ChatOpenAI()`](https://posit-dev.github.io/chatlas/reference/ChatOpenAI.html).
* perplexity.ai: [`ChatPerplexity()`](https://posit-dev.github.io/chatlas/reference/ChatPerplexity.html).

It also supports the following enterprise cloud providers:

* AWS Bedrock: [`ChatBedrockAnthropic()`](https://posit-dev.github.io/chatlas/reference/ChatBedrockAnthropic.html).
* Azure OpenAI: [`ChatAzureOpenAI()`](https://posit-dev.github.io/chatlas/reference/ChatAzureOpenAI.html).

To use a model provider that isn't listed here, you have two options:

1. If the model is OpenAI compatible, use `ChatOpenAI()` with the appropriate `base_url` and `api_key` (see [`ChatGithub`](https://github.com/posit-dev/chatlas/blob/main/chatlas/_github.py) for a reference).
2. If you're motivated, implement a new provider by subclassing [`Provider`](https://github.com/posit-dev/chatlas/blob/main/chatlas/_provider.py) and implementing the required methods.


## Model choice

If you're using chatlas inside your organisation, you'll be limited to what your org allows, which is likely to be one provided by a big cloud provider (e.g. `ChatAzureOpenAI()` and `ChatBedrockAnthropic()`). If you're using chatlas for your own personal exploration, you have a lot more freedom so we have a few recommendations to help you get started:

- `ChatOpenAI()` or `ChatAnthropic()` are both good places to start. `ChatOpenAI()` defaults to **GPT-4o**, but you can use `model = "gpt-4o-mini"` for a cheaper lower-quality model, or `model = "o1-mini"` for more complex reasoning.  `ChatAnthropic()` is similarly good; it defaults to **Claude 3.5 Sonnet** which we have found to be particularly good at writing code.

- `ChatGoogle()` is great for large prompts, because it has a much larger context window than other models. It allows up to 1 million tokens, compared to Claude 3.5 Sonnet's 200k and GPT-4o's 128k.

- `ChatOllama()`, which uses [Ollama](https://ollama.com), allows you to run models on your own computer. The biggest models you can run locally aren't as good as the state of the art hosted models, but they also don't share your data and and are effectively free.

## Using chatlas

You can chat via `chatlas` in several different ways, depending on whether you are working interactively or programmatically. They all start with creating a new chat object:

```python
from chatlas import ChatOpenAI

chat = ChatOpenAI(
  model = "gpt-4o",
  system_prompt = "You are a friendly but terse assistant.",
)
```

### Interactive console

From a `chat` instance, it's simple to start a web-based or terminal-based chat console, which is great for testing the capabilities of the model. In either case, responses stream in real-time, and context is preserved across turns.

```python
chat.app()
```

<div align="center">
<img width="500" alt="A web app for chatting with an LLM via chatlas" src="https://github.com/user-attachments/assets/e43f60cb-3686-435a-bd11-8215cb024d2e" class="border rounded">
</div>


Or, if you prefer to work from the terminal:

```python
chat.console()
```

```
Entering chat console. Press Ctrl+C to quit.

?> Who created Python?

Python was created by Guido van Rossum. He began development in the late 1980s and released the first version in 1991.

?> Where did he develop it?

Guido van Rossum developed Python while working at Centrum Wiskunde & Informatica (CWI) in the Netherlands.
```


### The `.chat()` method

For a more programmatic approach, you can use the `.chat()` method to ask a question and get a response. By default, the response prints to a [rich](https://github.com/Textualize/rich) console as it streams in:

```python
chat.chat("What preceding languages most influenced Python?")
```

```
Python was primarily influenced by ABC, with additional inspiration from C,
Modula-3, and various other languages.
```

To ask a question about an image, pass one or more additional input arguments using `content_image_file()` and/or `content_image_url()`:

```python
from chatlas import content_image_url

chat.chat(
    content_image_url("https://www.python.org/static/img/python-logo.png"),
    "Can you explain this logo?"
)
```

```
The Python logo features two intertwined snakes in yellow and blue,
representing the Python programming language. The design symbolizes...
```

To get the full response as a string, use the built-in `str()` function. Optionally, you can also suppress the rich console output by setting `echo="none"`:

```python
response = chat.chat("Who is Posit?", echo="none")
print(str(response))
```

As we'll see in later articles, `echo="all"` can also be useful for debugging, as it shows additional information, such as tool calls.

### The `.stream()` method

If you want to do something with the response in real-time (i.e., as it arrives in chunks), use the `.stream()` method. This method returns an iterator that yields each chunk of the response as it arrives:

```python
response = chat.stream("Who is Posit?")
for chunk in response:
    print(chunk, end="")
```

The `.stream()` method can also be useful if you're [building a chatbot](https://posit-dev.github.io/chatlas/web-apps.html) or other programs that needs to display responses as they arrive.


### Tool calling

Tool calling is as simple as passing a function with type hints and docstring to `.register_tool()`.

```python
import sys

def get_current_python_version() -> str:
    """Get the current version of Python."""
    return sys.version

chat.register_tool(get_current_python_version)
chat.chat("What's the current version of Python?")
```

```
The current version of Python is 3.13.
```

Learn more in the [tool calling article](https://posit-dev.github.io/chatlas/tool-calling.html)

### Structured data

Structured data (i.e., structured output) is as simple as passing a [pydantic](https://docs.pydantic.dev/latest/) model to `.extract_data()`.

```python
from pydantic import BaseModel

class Person(BaseModel):
    name: str
    age: int

chat.extract_data(
    "My name is Susan and I'm 13 years old",
    data_model=Person,
)
```

```
{'name': 'Susan', 'age': 13}
```

Learn more in the [structured data article](https://posit-dev.github.io/chatlas/structured-data.html)

### Export chat

Easily get a full markdown or HTML export of a conversation:

```python
chat.export("index.html", title="Python Q&A")
```

If the export doesn't have all the information you need, you can also access the full conversation history via the `.get_turns()` method:

```python
chat.get_turns()
```

And, if the conversation is too long, you can specify which turns to include:

```python
chat.export("index.html", turns=chat.get_turns()[-5:])
```

### Async

`chat` methods tend to be synchronous by default, but you can use the async flavor by appending `_async` to the method name:

```python
import asyncio

async def main():
    await chat.chat_async("What is the capital of France?")

asyncio.run(main())
```

### Typing support

`chatlas` has full typing support, meaning that, among other things, autocompletion just works in your favorite editor:

<div align="center">
<img width="500" alt="Autocompleting model options in ChatOpenAI" src="https://github.com/user-attachments/assets/163d6d8a-7d58-422d-b3af-cc9f2adee759" class="rounded">
</div>



### Troubleshooting

Sometimes things like token limits, tool errors, or other issues can cause problems that are hard to diagnose.
In these cases, the `echo="all"` option is helpful for getting more information about what's going on under the hood.

```python
chat.chat("What is the capital of France?", echo="all")
```

This shows important information like tool call results, finish reasons, and more.

If the problem isn't self-evident, you can also reach into the `.get_last_turn()`, which contains the full response object, with full details about the completion.


<div align="center">
  <img width="500" alt="Turn completion details with typing support" src="https://github.com/user-attachments/assets/eaea338d-e44a-4e23-84a7-2e998d8af3ba" class="rounded">
</div>


For monitoring issues in a production (or otherwise non-interactive) environment, you may want to enabling logging. Also, since `chatlas` builds on top of packages like `anthropic` and `openai`, you can also enable their debug logging to get lower-level information, like HTTP requests and response codes.

```shell
$ export CHATLAS_LOG=info
$ export OPENAI_LOG=info
$ export ANTHROPIC_LOG=info
```

### Next steps

If you're new to world LLMs, you might want to read the [Get Started](https://posit-dev.github.io/chatlas/get-started.html) guide, which covers some basic concepts and terminology.

Once you're comfortable with the basics, you can explore more in-depth topics like [prompt design](https://posit-dev.github.io/chatlas/prompt-design.html) or the [API reference](https://posit-dev.github.io/chatlas/reference/index.html).

</DOCUMENTATION>

Here is chatlas's documentation on using it with Shiny.

<DOCUMENTATION PACKAGE="chatlas" PAGE="shiny">
In the intro, we learned how the `.app()` method launches a web app with a simple chat interface, for example:

```python
from chatlas import ChatAnthropic

chat = ChatAnthropic()
chat.app()
```

This is a great way to quickly test your model, but you'll likely want to embed similar functionality into a larger web app. Here's how you can do that we different web frameworks.

## Shiny

Using Shiny's [`ui.Chat` component](https://shiny.posit.co/py/components/display-messages/chat/), you can simply pass user input from the component into the `chat.stream()` method. This generate a response stream that can then be passed to `.append_message_stream()`.

```python
from chatlas import ChatAnthropic
from shiny.express import ui

chat = ui.Chat(
    id="ui_chat",
    messages=["Hi! How can I help you today?"],
)
chat.ui()

chat_model = ChatAnthropic()

@chat.on_user_submit
async def handle_user_input():
    response = chat_model.stream(chat.user_input())
    await chat.append_message_stream(response)
```

</DOCUMENTATION>


Here are some examples of Shiny chat applications.

<DOCUMENTATION PACKAGE="shiny" LABEL="examples">
This file is a merged representation of the entire codebase, combined into a single document by Repomix.

================================================================
File Summary
================================================================

Purpose:
--------
This file contains a packed representation of the entire repository's contents.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.

File Format:
------------
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Multiple file entries, each consisting of:
  a. A separator line (================)
  b. The file path (File: path/to/file)
  c. Another separator line
  d. The full contents of the file
  e. A blank line

Usage Guidelines:
-----------------
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

Notes:
------
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded

Additional Info:
----------------

================================================================
Directory Structure
================================================================
llm-enterprise/
  aws-bedrock-anthropic/
    _template.json
    app_utils.py
    app.py
    requirements.txt
  azure-openai/
    _template.json
    app_utils.py
    app.py
    requirements.txt
llms/
  anthropic/
    _template.json
    app_utils.py
    app.py
    requirements.txt
  google/
    _template.json
    app_utils.py
    app.py
    requirements.txt
  langchain/
    _template.json
    app_utils.py
    app.py
    requirements.txt
  ollama/
    _template.json
    app.py
    requirements.txt
  openai/
    _template.json
    app_utils.py
    app.py
    requirements.txt
  playground/
    _template.json
    app_utils.py
    app.py
    requirements.txt
starters/
  hello/
    _template.json
    app-core.py
    app.py
    requirements.txt
  sidebar-dark/
    _template.json
    app.py

================================================================
Files
================================================================

================
File: llm-enterprise/aws-bedrock-anthropic/_template.json
================
{
  "type": "app",
  "id": "chat-ai-anthropic-aws",
  "title": "Chat AI using Anthropic via AWS Bedrock"
}

================
File: llm-enterprise/aws-bedrock-anthropic/app_utils.py
================
import os
from pathlib import Path
from typing import Any

app_dir = Path(__file__).parent
env_file = app_dir / ".env"


def load_dotenv(dotenv_path: os.PathLike[str] = env_file, **kwargs: Any) -> None:
    """
    A convenience wrapper around `dotenv.load_dotenv` that warns if `dotenv` is not installed.
    It also returns `None` to make it easier to ignore the return value.
    """
    try:
        import dotenv

        dotenv.load_dotenv(dotenv_path=dotenv_path, **kwargs)
    except ImportError:
        import warnings

        warnings.warn(
            "Could not import `dotenv`. If you want to use `.env` files to "
            "load environment variables, please install it using "
            "`pip install python-dotenv`.",
            stacklevel=2,
        )

================
File: llm-enterprise/aws-bedrock-anthropic/app.py
================
# ------------------------------------------------------------------------------------
# A basic Shiny Chat powered by Anthropic's Claude model with Bedrock.
# To run it, you'll need an AWS Bedrock configuration.
# To get started, follow the instructions at https://aws.amazon.com/bedrock/claude/
# as well as https://github.com/anthropics/anthropic-sdk-python#aws-bedrock
# ------------------------------------------------------------------------------------
from app_utils import load_dotenv
from chatlas import ChatBedrockAnthropic

from shiny.express import ui

# Either explicitly set the AWS environment variables before launching the app, or set
# them in a file named `.env`. The `python-dotenv` package will load `.env` as
# environment variables which can be read by `os.getenv()`.
load_dotenv()
chat_model = ChatBedrockAnthropic(
    model="anthropic.claude-3-sonnet-20240229-v1:0",
    # aws_secret_key=os.getenv("AWS_SECRET_KEY"),
    # aws_access_key=os.getenv("AWS_ACCESS_KEY"),
    # aws_region=os.getenv("AWS_REGION"),
    # aws_account_id=os.getenv("AWS_ACCOUNT_ID"),
)

# Set some Shiny page options
ui.page_opts(
    title="Hello Anthropic Claude Chat",
    fillable=True,
    fillable_mobile=True,
)

# Create and display empty chat
chat = ui.Chat(id="chat")
chat.ui()


# Define a callback to run when the user submits a message
@chat.on_user_submit
async def handle_user_input(user_input: str):
    response = chat_model.stream(user_input)
    await chat.append_message_stream(response)

================
File: llm-enterprise/aws-bedrock-anthropic/requirements.txt
================
shiny
python-dotenv
tokenizers
chatlas
anthropic[bedrock]

================
File: llm-enterprise/azure-openai/_template.json
================
{
  "type": "app",
  "id": "chat-ai-azure-openai",
  "title": "Chat AI using OpenAI via Azure"
}

================
File: llm-enterprise/azure-openai/app_utils.py
================
import os
from pathlib import Path
from typing import Any

app_dir = Path(__file__).parent
env_file = app_dir / ".env"


def load_dotenv(dotenv_path: os.PathLike[str] = env_file, **kwargs: Any) -> None:
    """
    A convenience wrapper around `dotenv.load_dotenv` that warns if `dotenv` is not installed.
    It also returns `None` to make it easier to ignore the return value.
    """
    try:
        import dotenv

        dotenv.load_dotenv(dotenv_path=dotenv_path, **kwargs)
    except ImportError:
        import warnings

        warnings.warn(
            "Could not import `dotenv`. If you want to use `.env` files to "
            "load environment variables, please install it using "
            "`pip install python-dotenv`.",
            stacklevel=2,
        )

================
File: llm-enterprise/azure-openai/app.py
================
# ------------------------------------------------------------------------------------
# A basic Shiny Chat example powered by OpenAI running on Azure.
# ------------------------------------------------------------------------------------
import os

from app_utils import load_dotenv
from chatlas import ChatAzureOpenAI

from shiny.express import ui

# ChatAzureOpenAI() requires an API key from Azure OpenAI.
# See the docs for more information on how to obtain one.
# https://posit-dev.github.io/chatlas/reference/ChatAzureOpenAI.html
load_dotenv()
chat_model = ChatAzureOpenAI(
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
    endpoint="https://my-endpoint.openai.azure.com",
    deployment_id="gpt-4o-mini",
    api_version="2024-08-01-preview",
)

# Set some Shiny page options
ui.page_opts(
    title="Hello Azure OpenAI Chat",
    fillable=True,
    fillable_mobile=True,
)

# Create a chat instance, with an initial message
chat = ui.Chat(
    id="chat",
    messages=["Hello! How can I help you today?"],
)
chat.ui()


# Define a callback to run when the user submits a message
@chat.on_user_submit
async def handle_user_input(user_input: str):
    response = chat_model.stream(user_input)
    await chat.append_message_stream(response)

================
File: llm-enterprise/azure-openai/requirements.txt
================
shiny
python-dotenv
tokenizers
chatlas
openai

================
File: llms/anthropic/_template.json
================
{
  "type": "app",
  "id": "chat-ai-anthropic",
  "title": "Chat AI using Anthropic"
}

================
File: llms/anthropic/app_utils.py
================
import os
from pathlib import Path
from typing import Any

app_dir = Path(__file__).parent
env_file = app_dir / ".env"


def load_dotenv(dotenv_path: os.PathLike[str] = env_file, **kwargs: Any) -> None:
    """
    A convenience wrapper around `dotenv.load_dotenv` that warns if `dotenv` is not installed.
    It also returns `None` to make it easier to ignore the return value.
    """
    try:
        import dotenv

        dotenv.load_dotenv(dotenv_path=dotenv_path, **kwargs)
    except ImportError:
        import warnings

        warnings.warn(
            "Could not import `dotenv`. If you want to use `.env` files to "
            "load environment variables, please install it using "
            "`pip install python-dotenv`.",
            stacklevel=2,
        )

================
File: llms/anthropic/app.py
================
# ------------------------------------------------------------------------------------
# A basic Shiny Chat example powered by Anthropic's Claude model.
# ------------------------------------------------------------------------------------
import os

from app_utils import load_dotenv
from chatlas import ChatAnthropic

from shiny.express import ui

# ChatAnthropic() requires an API key from Anthropic.
# See the docs for more information on how to obtain one.
# https://posit-dev.github.io/chatlas/reference/ChatAnthropic.html
load_dotenv()
chat_model = ChatAnthropic(
    api_key=os.environ.get("ANTHROPIC_API_KEY"),
    model="claude-3-5-sonnet-latest",
    system_prompt="You are a helpful assistant.",
)


# Set some Shiny page options
ui.page_opts(
    title="Hello Anthropic Claude Chat",
    fillable=True,
    fillable_mobile=True,
)

# Create and display a Shiny chat component
chat = ui.Chat(
    id="chat",
    messages=["Hello! How can I help you today?"],
)
chat.ui()


# Generate a response when the user submits a message
@chat.on_user_submit
async def handle_user_input(user_input: str):
    response = chat_model.stream(user_input)
    await chat.append_message_stream(response)

================
File: llms/anthropic/requirements.txt
================
shiny
python-dotenv
tokenizers
chatlas
anthropic

================
File: llms/google/_template.json
================
{
  "type": "app",
  "id": "chat-ai-gemini",
  "title": "Chat AI using Google Gemini"
}

================
File: llms/google/app_utils.py
================
import os
from pathlib import Path
from typing import Any

app_dir = Path(__file__).parent
env_file = app_dir / ".env"


def load_dotenv(dotenv_path: os.PathLike[str] = env_file, **kwargs: Any) -> None:
    """
    A convenience wrapper around `dotenv.load_dotenv` that warns if `dotenv` is not installed.
    It also returns `None` to make it easier to ignore the return value.
    """
    try:
        import dotenv

        dotenv.load_dotenv(dotenv_path=dotenv_path, **kwargs)
    except ImportError:
        import warnings

        warnings.warn(
            "Could not import `dotenv`. If you want to use `.env` files to "
            "load environment variables, please install it using "
            "`pip install python-dotenv`.",
            stacklevel=2,
        )

================
File: llms/google/app.py
================
# ------------------------------------------------------------------------------------
# A basic Shiny Chat example powered by Google's Gemini model.
# ------------------------------------------------------------------------------------
import os

from app_utils import load_dotenv
from chatlas import ChatGoogle

from shiny.express import ui

# ChatGoogle() requires an API key from Google.
# See the docs for more information on how to obtain one.
# https://posit-dev.github.io/chatlas/reference/ChatGoogle.html
load_dotenv()
chat_model = ChatGoogle(
    api_key=os.environ.get("GOOGLE_API_KEY"),
    system_prompt="You are a helpful assistant.",
    model="gemini-1.5-flash",
)

# Set some Shiny page options
ui.page_opts(
    title="Hello Google Gemini Chat",
    fillable=True,
    fillable_mobile=True,
)

# Create and display empty chat
chat = ui.Chat(id="chat")
chat.ui()


# Generate a response when the user submits a message
@chat.on_user_submit
async def handle_user_input(user_input: str):
    response = chat_model.stream(user_input)
    await chat.append_message_stream(response)

================
File: llms/google/requirements.txt
================
shiny
python-dotenv
tokenizers
chatlas
google-generativeai

================
File: llms/langchain/_template.json
================
{
  "type": "app",
  "id": "chat-ai-langchain",
  "title": "Chat AI using LangChain"
}

================
File: llms/langchain/app_utils.py
================
import os
from pathlib import Path
from typing import Any

app_dir = Path(__file__).parent
env_file = app_dir / ".env"


def load_dotenv(dotenv_path: os.PathLike[str] = env_file, **kwargs: Any) -> None:
    """
    A convenience wrapper around `dotenv.load_dotenv` that warns if `dotenv` is not installed.
    It also returns `None` to make it easier to ignore the return value.
    """
    try:
        import dotenv

        dotenv.load_dotenv(dotenv_path=dotenv_path, **kwargs)
    except ImportError:
        import warnings

        warnings.warn(
            "Could not import `dotenv`. If you want to use `.env` files to "
            "load environment variables, please install it using "
            "`pip install python-dotenv`.",
            stacklevel=2,
        )

================
File: llms/langchain/app.py
================
# ------------------------------------------------------------------------------------
# A basic Shiny Chat example powered by OpenAI via LangChain.
# To run it, you'll need OpenAI API key.
# To get one, follow the instructions at https://platform.openai.com/docs/quickstart
# To use other providers/models via LangChain, see https://python.langchain.com/v0.1/docs/modules/model_io/chat/quick_start/
# ------------------------------------------------------------------------------------
import os

from app_utils import load_dotenv
from langchain_openai import ChatOpenAI

from shiny.express import ui

# Either explicitly set the OPENAI_API_KEY environment variable before launching the
# app, or set them in a file named `.env`. The `python-dotenv` package will load `.env`
# as environment variables which can later be read by `os.getenv()`.
load_dotenv()
chat_model = ChatOpenAI(
    api_key=os.environ.get("OPENAI_API_KEY"),
    model="gpt-4o",
)

# Set some Shiny page options
ui.page_opts(
    title="Hello LangChain Chat Models",
    fillable=True,
    fillable_mobile=True,
)

# Create and display a Shiny chat component
chat = ui.Chat(
    id="chat",
    messages=["Hello! How can I help you today?"],
)
chat.ui()


# Define a callback to run when the user submits a message
@chat.on_user_submit
async def handle_user_input(user_input: str):
    response = chat_model.stream(user_input)
    await chat.append_message_stream(response)

================
File: llms/langchain/requirements.txt
================
shiny
python-dotenv
tokenizers
langchain-openai

================
File: llms/ollama/_template.json
================
{
  "type": "app",
  "id": "chat-ai-ollama",
  "title": "Chat AI using Ollama"
}

================
File: llms/ollama/app.py
================
# ------------------------------------------------------------------------------------
# A basic Shiny Chat example powered by Ollama.
# ------------------------------------------------------------------------------------

from chatlas import ChatOllama

from shiny.express import ui

# ChatOllama() requires an Ollama model server to be running locally.
# See the docs for more information on how to set up a local Ollama server.
# https://posit-dev.github.io/chatlas/reference/ChatOllama.html
chat_model = ChatOllama(model="llama3.1")

# Set some Shiny page options
ui.page_opts(
    title="Hello Ollama Chat",
    fillable=True,
    fillable_mobile=True,
)

# Create and display a Shiny chat component
chat = ui.Chat(
    id="chat",
    messages=["Hello! How can I help you today?"],
)
chat.ui()


# Generate a response when the user submits a message
@chat.on_user_submit
async def handle_user_input(user_input: str):
    response = chat_model.stream(user_input)
    await chat.append_message_stream(response)

================
File: llms/ollama/requirements.txt
================
shiny
tokenizers
chatlas
ollama

================
File: llms/openai/_template.json
================
{
  "type": "app",
  "id": "chat-ai-openai",
  "title": "Chat AI using OpenAI"
}

================
File: llms/openai/app_utils.py
================
import os
from pathlib import Path
from typing import Any

app_dir = Path(__file__).parent
env_file = app_dir / ".env"


def load_dotenv(dotenv_path: os.PathLike[str] = env_file, **kwargs: Any) -> None:
    """
    A convenience wrapper around `dotenv.load_dotenv` that warns if `dotenv` is not installed.
    It also returns `None` to make it easier to ignore the return value.
    """
    try:
        import dotenv

        dotenv.load_dotenv(dotenv_path=dotenv_path, **kwargs)
    except ImportError:
        import warnings

        warnings.warn(
            "Could not import `dotenv`. If you want to use `.env` files to "
            "load environment variables, please install it using "
            "`pip install python-dotenv`.",
            stacklevel=2,
        )

================
File: llms/openai/app.py
================
# ------------------------------------------------------------------------------------
# A basic Shiny Chat example powered by OpenAI.
# ------------------------------------------------------------------------------------
import os

from app_utils import load_dotenv
from chatlas import ChatOpenAI

from shiny.express import ui

# ChatOpenAI() requires an API key from OpenAI.
# See the docs for more information on how to obtain one.
# https://posit-dev.github.io/chatlas/reference/ChatOpenAI.html
load_dotenv()
chat_model = ChatOpenAI(
    api_key=os.environ.get("OPENAI_API_KEY"),
    model="gpt-4o",
    system_prompt="You are a helpful assistant.",
)


# Set some Shiny page options
ui.page_opts(
    title="Hello OpenAI Chat",
    fillable=True,
    fillable_mobile=True,
)

# Create and display a Shiny chat component
chat = ui.Chat(
    id="chat",
    messages=["Hello! How can I help you today?"],
)
chat.ui()


# Generate a response when the user submits a message
@chat.on_user_submit
async def handle_user_input(user_input: str):
    response = chat_model.stream(user_input)
    await chat.append_message_stream(response)

================
File: llms/openai/requirements.txt
================
shiny
python-dotenv
tokenizers
chatlas
openai

================
File: llms/playground/_template.json
================
{
  "type": "app",
  "id": "chat-ai-playground",
  "title": "Chat Playground w/ OpenAI, Anthropic, and Google"
}

================
File: llms/playground/app_utils.py
================
import os
from pathlib import Path
from typing import Any

app_dir = Path(__file__).parent
env_file = app_dir / ".env"


def load_dotenv(dotenv_path: os.PathLike[str] = env_file, **kwargs: Any) -> None:
    """
    A convenience wrapper around `dotenv.load_dotenv` that warns if `dotenv` is not installed.
    It also returns `None` to make it easier to ignore the return value.
    """
    try:
        import dotenv

        dotenv.load_dotenv(dotenv_path=dotenv_path, **kwargs)
    except ImportError:
        import warnings

        warnings.warn(
            "Could not import `dotenv`. If you want to use `.env` files to "
            "load environment variables, please install it using "
            "`pip install python-dotenv`.",
            stacklevel=2,
        )

================
File: llms/playground/app.py
================
# ------------------------------------------------------------------------------------
# A Shiny Chat example showing how to use different language models via chatlas.
# To run it with all the different providers/models, you'll need API keys for each.
# Namely, OPENAI_API_KEY, ANTHROPIC_API_KEY, and GOOGLE_API_KEY.
# To see how to get these keys, see chatlas' reference:
# https://posit-dev.github.io/chatlas/reference/
# ------------------------------------------------------------------------------------

import chatlas as ctl
from app_utils import load_dotenv

from shiny import reactive
from shiny.express import input, ui

load_dotenv()

models = {
    "openai": ["gpt-4o-mini", "gpt-4o"],
    "claude": [
        "claude-3-opus-latest",
        "claude-3-5-sonnet-latest",
        "claude-3-haiku-20240307",
    ],
    "google": ["gemini-1.5-pro-latest"],
}

model_choices: dict[str, dict[str, str]] = {}
for key, value in models.items():
    model_choices[key] = dict(zip(value, value))

ui.page_opts(
    title="Shiny Chat Playground",
    fillable=True,
    fillable_mobile=True,
)

# Sidebar with input controls
with ui.sidebar(position="right"):
    ui.input_select("model", "Model", choices=model_choices)
    ui.input_select(
        "system_actor",
        "Response style",
        choices=["Chuck Norris", "Darth Vader", "Yoda", "Gandalf", "Sherlock Holmes"],
    )
    ui.input_switch("stream", "Stream", value=True)
    ui.input_slider("temperature", "Temperature", min=0, max=2, step=0.1, value=1)
    ui.input_slider("max_tokens", "Max Tokens", min=1, max=4096, step=1, value=100)
    ui.input_action_button("clear", "Clear chat")

# The chat component
chat = ui.Chat(id="chat")
chat.ui(width="100%")


@reactive.calc
def get_model():
    model_params = {
        "system_prompt": (
            "You are a helpful AI assistant. "
            f" Provide answers in the style of {input.system_actor()}."
        ),
        "model": input.model(),
    }

    if input.model() in models["openai"]:
        chat_model = ctl.ChatOpenAI(**model_params)
    elif input.model() in models["claude"]:
        chat_model = ctl.ChatAnthropic(**model_params)
    elif input.model() in models["google"]:
        chat_model = ctl.ChatGoogle(**model_params)
    else:
        raise ValueError(f"Invalid model: {input.model()}")

    return chat_model


@reactive.calc
def chat_params():
    if input.model() in models["google"]:
        return {
            "generation_config": {
                "temperature": input.temperature(),
                "max_output_tokens": input.max_tokens(),
            }
        }
    else:
        return {
            "temperature": input.temperature(),
            "max_tokens": input.max_tokens(),
        }


@chat.on_user_submit
async def handle_user_input(user_input: str):
    if input.stream():
        response = get_model().stream(user_input, kwargs=chat_params())
        await chat.append_message_stream(response)
    else:
        response = get_model().chat(user_input, echo="none", kwargs=chat_params())
        await chat.append_message(response)


@reactive.effect
@reactive.event(input.clear)
def _():
    chat.clear_messages()

================
File: llms/playground/requirements.txt
================
chatlas
openai
anthropic
google-generativeai
python-dotenv
shiny

================
File: starters/hello/_template.json
================
{
  "type": "app",
  "id": "chat-hello",
  "title": "Hello Shiny Chat"
}

================
File: starters/hello/app-core.py
================
from shiny import App, ui

app_ui = ui.page_fillable(
    ui.panel_title("Hello Shiny Chat"),
    ui.chat_ui("chat"),
    fillable_mobile=True,
)

# Create a welcome message
welcome = ui.markdown(
    """
    Hi! This is a simple Shiny `Chat` UI. Enter a message below and I will
    simply repeat it back to you. For more examples, see this
    [folder of examples](https://github.com/posit-dev/py-shiny/tree/main/shiny/templates/chat).
    """
)


def server(input, output, session):
    chat = ui.Chat(id="chat", messages=[welcome])

    # Define a callback to run when the user submits a message
    @chat.on_user_submit
    async def handle_user_input(user_input: str):
        # Append a response to the chat
        await chat.append_message(f"You said: {user_input}")


app = App(app_ui, server)

================
File: starters/hello/app.py
================
from shiny.express import ui

# Set some Shiny page options
ui.page_opts(
    title="Hello Shiny Chat",
    fillable=True,
    fillable_mobile=True,
)

# Create a welcome message
welcome = ui.markdown(
    """
    Hi! This is a simple Shiny `Chat` UI. Enter a message below and I will
    simply repeat it back to you. For more examples, see this
    [folder of examples](https://github.com/posit-dev/py-shiny/tree/main/shiny/templates/chat).
    """
)

# Create a chat instance
chat = ui.Chat(
    id="chat",
    messages=[welcome],
)

# Display it
chat.ui()


# Define a callback to run when the user submits a message
@chat.on_user_submit
async def handle_user_input(user_input: str):
    # Append a response to the chat
    await chat.append_message(f"You said: {user_input}")

================
File: starters/hello/requirements.txt
================
shiny

================
File: starters/sidebar-dark/_template.json
================
{
  "type": "app",
  "id": "chat-sidebar-dark",
  "title": "Chat in a sidebar with dark mode"
}

================
File: starters/sidebar-dark/app.py
================
# --------------------------------------------------------------------------------
# This example demonstrates Shiny Chat's dark mode capability.
# --------------------------------------------------------------------------------

from shiny.express import ui

# Page options with a dark mode toggle
ui.page_opts(
    title=ui.tags.div(
        "Hello Dark mode",
        ui.input_dark_mode(mode="dark"),
        class_="d-flex justify-content-between w-100",
    ),
    fillable=True,
    fillable_mobile=True,
)

# An empty, closed, sidebar
with ui.sidebar(width=300, style="height:100%", position="right"):
    chat = ui.Chat(id="chat", messages=["Welcome to the dark side!"])
    chat.ui(height="100%")


# Define a callback to run when the user submits a message
@chat.on_user_submit
async def handle_user_input(user_input: str):
    await chat.append_message_stream(f"You said: {user_input}")


"Lorem ipsum dolor sit amet, consectetur adipiscing elit"



================================================================
End of Codebase
================================================================
</DOCUMENTATION>
