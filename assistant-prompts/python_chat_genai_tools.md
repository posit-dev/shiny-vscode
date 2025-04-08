{{!
/* from https://github.com/posit-dev/py-shiny-site/blob/f86dbfd9a60f0a23351119eb33df8a14f6f02b1f/docs/genai-tools.qmd */
}}

<DOCUMENTATION LABEL="Shiny Chatbot tools">

## Why tool calling? {#why-tool-calling}

Large language models (LLMs) are inherently good at drawing from their vast knowledge base to generate helpful responses based on a user prompt.
However, they are not inherently good at or capable of everything.
Some of their limitations can be addressed by equipping the LLM with the ability to call tools (i.e., functions).
For example, LLMs are not inherently good at:

1. Making precise, reliable, and reproducible calculations based on data.
2. Accessing up-to-date, private, or otherwise "most relevant" information.
3. Generally accomplishing programmatic tasks at the request of the user.

For a motivating example, consider [the sidebot template](../templates/sidebot/index.qmd).
It allows end users to ask questions about a dataset using natural language, and see multiple views of the data update in real-time.
It works by equipping the LLM with the context and tools to control the dashboard through SQL.
And, since LLMs are inherently good at translating natural language to SQL, the result is a suprisingly effective (and verfiable!) way to explore data.

![Screenshot of the [sidebot template](../templates/sidebot/index.qmd), which allows users to explore data using natural language.](/images/genai-sidebot.png){class="rounded shadow lightbox mt-3"}


This article discusses the mechanics behind what makes an app like sidebot work.
It covers:

* [Get started](#get-started) with tool calls, including [displaying](#basic-chatbot) status/results in Shiny.
* Combine tools with [reactivity](#reactivity), enabling the LLM to "use" the app.
* [Customize](#custom-display) the display of tool calls.


::: callout-tip
### Beyond chatbots

Although this article focuses on using tool calling in a chatbot, the same ideas also apply to [streaming markdown](genai-stream.qmd)
:::

## Get started {#get-started}

### Fundamentals

LLMs are trained on data up until a certain cutoff date, and they don't natively have access to the internet.
This means that they can't answer questions about current events, weather, etc.
Most LLMs nowadays are at least aware of this limitation:

```python
from chatlas import ChatAnthropic
chat_client = ChatAnthropic()
chat_client.chat("What's the current temperature in Duluth, MN?")
```

> I don't have the ability to check the current temperature in Duluth, MN in real-time.

However, we can equip the LLM with a function to query current weather from a web API.
Since LLMs are good at finding structure from unstructured input, we can have a tool that accepts lat/long as input, and the LLM is smart enough to infer a lat/long from a city name (or ask the user for lat/long).

Note also that the function **includes type hints and a docstring**.
This is important because it helps the LLM understand what the function does and how to use it.

```python
import requests

def get_current_weather(latitude: float, longitude: float):
    """Get the current current weather given a latitude and longitude."""

    lat_lng = f"latitude={latitude}&longitude={longitude}"
    url = f"https://api.open-meteo.com/v1/forecast?{lat_lng}&current=temperature_2m,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m"
    response = requests.get(url)
    json = response.json()
    return json["current"]

chat_client.register_tool(get_current_weather)
chat_client.chat("What's the current temperature in Duluth, MN?")
```

> The current temperature in Duluth, Minnesota is 0.9°C (which is approximately 33.6°F). There are also strong winds at 32.7 km/h (about 20.3 mph).

::: callout-tip
### Verify the tool call

In `.chat()`, you can set `echo="all"` to see all the tool call information in your console.
In the [Tool displays](#tool-displays), we'll see how to display this information in the Shiny UI.
:::


::: callout-note
### Learn more

See the [chatlas docs](https://posit-dev.github.io/chatlas/tool-calling.html) to learn more about tool calling fundamentals.
:::

### Basic chatbot {#basic-chatbot}

::: callout-warning
### In development

This section uses APIs that are still in development, so they are subject to change.
These examples require the latest stable version of `shiny` and the dev version of `chatlas`.

```bash
pip install -U shiny
pip install git+https://github.com/posit-dev/chatlas.git
```
:::


To embed our `chat_client` in a Shiny [chatbot](genai-chatbots.qmd), let's put it in a `client.py` module and use it for response generation.
And to display the tool call results, just set `content="all"` in the `.stream_async()` method.
This way, `chatlas` will include tool call content objects in the stream, and since those content objects know how to display themselves in Shiny, we get a generic display of the tool request, response, and/or any errors that occurred.

<details>
<summary> client.py </summary>

```python
import requests
from chatlas import ChatAnthropic

chat_client = ChatAnthropic()

def get_current_weather(latitude: float, longitude: float):
    """Get the current temperature given a latitude and longitude."""

    lat_lng = f"latitude={latitude}&longitude={longitude}"
    url = f"https://api.open-meteo.com/v1/forecast?{lat_lng}&current=temperature_2m,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m"
    response = requests.get(url)
    json = response.json()
    return json["current"]

chat_client.register_tool(get_current_weather)
```
</details>


<details open>
<summary> app.py </summary>

```python
from client import chat_client
from shiny.express import ui

chat = ui.Chat(id="chat")
chat.ui(messages=["Hello! How can I help you today?"])

@chat.on_user_submit
async def _(user_input: str):
    response = await chat_client.stream_async(
      user_input,
      content="all"
    )
    await chat.append_message_stream(response)
```
</details>


![Screenshot of a tool result.](/images/genai-tool-call-ui.png){class="rounded shadow lightbox "}

Once the tool call is made, you can expand the `<details>` of the tool call to see what the model requested for arguments as well as the result sent to the model.

![Screenshot of tool call result expanded.](/images/genai-tool-result-ui.png){class="rounded shadow lightbox"}

Also, for tools that take a while to run, the user is notified of what tool is running along with a bouncing dot to indicate that the tool is still running.

![Screenshot of a tool call running.](/images/genai-tool-call-running-ui.gif){class="rounded shadow lightbox"}

And, in the case of an error, the user is also notified of the error.

![Screenshot of a tool call error.](/images/genai-tool-call-error-ui.png){class="rounded shadow lightbox"}

In general, these default displays should be enough to let your users know what the LLM is request/receiving to help general their responses.


## Reactivity

Combining tool calling with [reactivity](reactive-foundations.qmd) is a powerful technique that can effectively let the LLM interact with the app.
Here we'll explore a few general patterns for doing this.


### Updating inputs

The most basic way to hand over control to the LLM is to have it update reactive `input`(s).
The core idea is to wrap a `ui.update_*()` call into a tool function, and register that function with the `chat_client`.
Then, when a user

<details>
<summary> client.py </summary>

```python
from chatlas import ChatAnthropic
from shiny.express import ui

SLIDER_ID = "slider"

chat_client = ChatAnthropic(
    system_prompt=(
        "You are a helpful assistant in the sidebar of a Shiny app."
        "You have a tool available to you to update a slider in the main panel of the app."
    )
)

def update_slider(value: int):
    "Update the slider in the main panel with the provided value"
    ui.update_slider(SLIDER_ID, value=value)

chat_client.register_tool(update_slider)
```

</details>

<details open>
<summary> app.py </summary>

```python
from client import chat_client, SLIDER_ID
from shiny.express import ui

ui.input_slider(SLIDER_ID, "Value", value=50, min=0, max=100)

welcome = "Welcome! Try asking me to <span class='suggestion'>update the slider to 80</span> "

with ui.sidebar(width=350):
    chat = ui.Chat("chat")
    chat.ui(messages=[welcome])

@chat.on_user_submit
async def _(user_input: str):
    response = await chat_client.stream_async(user_input)
    await chat.append_message_stream(response)
```

</details>


![Screenshot of a tool call that updated the slider from 50 to 80.](/images/genai-tool-call-slider-ui.png){class="rounded shadow lightbox"}


### Managing state

In Shiny, a reactive value can derive from either a input [component](../components/index.qmd) (e.g., `ui.input_select()`, etc) or an entirely server-side `reactive.value()`.
Generally speaking, the latter approach is useful for tracking state that may not exist in the UI (e.g., authentication, user activity, etc).
Similar to how we can equipped the LLM to update an input component, we can also equip it to update a reactive value to have it drive the app's state.

The sidebot template ([mentioned at the top](#why-tool-calling) of this article) illustrates a particularly powerful application of managing state.
In this case, the state is an SQL query.
When that state changes, it triggers a reactive data frame (`current_data`) to be updated, which in turn updates all the downstream views of the data.

```python
import duckdb
from shiny import reactive

# An SQL query
current_query = reactive.value("")

# Reactively execute the SQL query and
# return the result as a data frame
@reactive.calc
def current_data():
    if current_query() == "":
        return tips
    return duckdb.query(current_query()).df()
```

The LLM is also provided a tool (`update_dashboard()`) which takes an SQL query as input, and sets a new value for the `current_query` reactive value.

```python
from typing import Annotated

async def update_dashboard(
    query: Annotated[str, 'A DuckDB SQL query; must be a SELECT statement, or "".']
):
    "Modifies the data presented in the data dashboard based on the provided SQL query"
    async with reactive.lock():
        current_query.set(query)
        await reactive.flush()
```

::: callout-note
### Reactive locking

Since this tool runs within a [non-blocking message stream](genai-tools.qmd#non-blocking-streams) (i.e., `.append_message_stream()`), in order to prevent race conditions, it must lock reactivity graph when updating reactive value(s).
If the tool was, instead, running in a [blocking stream](genai-chatbots.qmd#message-stream-context), the `reactive.lock()` and `reactive.flush()` wouldn't be necessary.
:::

The final crucial piece is that, in order for the LLM to generate accurate SQL, it needs to know the schema of the dataset.
This is done by passing the table schema to the LLM's [system prompt](genai-chatbots.qmd#models--prompts).

Since the general pattern of having a tool to update a reactive data frame via SQL is so useful, the[querychat](../templates/querychat/index.qmd) package generalizes this pattern to make it more accessible and easier to use.

## Custom tool display {#custom-display}

::: callout-warning
### In development

This section documents APIs that are still in development, so they are subject to change.
These examples require the latest stable version of `shiny` and the dev version of `chatlas`.

```bash
pip install -U shiny
pip install git+https://github.com/posit-dev/chatlas.git
```
:::

Customizing how tool results are displayed can be useful for a variety of reasons.
For example, you may want to simply style results differently, or something much more sophisticated like displaying a map or a table.

To customize the result display, you can:

1. Subclass the [`chatlas.ContentToolResult` class](https://posit-dev.github.io/chatlas/reference/types.ContentToolResult.html)
2. Override the `tagify()` method. This can return any valid `ui.Chat()` message content (i.e., a markdown string or Shiny UI).
3. Return an instance of this subclass from your tool function.

This basic example below would just style the tool result differently than the default:

```python
from chatlas import ContentToolResult

class WeatherToolResult(ContentToolResult):
    def tagify(self):
        if self.error:
            return super().tagify()
        else:
            args = self.arguments
            params = ", ".join(f"{k}={v}" for k, v in args.items())
            temp = self.value["temperature_2m"]
            return (
                f"✅ Tool call of `{self.name}({params})` "
                "gave temperature of: {temp} °C\n\n"
            )

def get_current_weather(latitude: float, longitude: float):
    """Get the current temperature given a latitude and longitude."""

    lat_lng = f"latitude={latitude}&longitude={longitude}"
    url = f"https://api.open-meteo.com/v1/forecast?{lat_lng}&current=temperature_2m,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m"
    response = requests.get(url)
    json = response.json()
    return WeatherToolResult(value=json["current"])
```

Keep in mind that [Shiny UI can be included in messages](genai-chatbots.qmd#interactive-messages), so you could do something like diplay a [Jupyter Widget](jupyter-widgets.qmd).


<details>
<summary> Show code </summary>

```python
import ipywidgets
from shinywidgets import register_widget, output_widget
from ipyleaflet import Map, CircleMarker

class WeatherToolResult(ContentToolResult):
    def tagify(self):
        if self.error:
            return super().tagify()

        args = self.arguments
        loc = (args["latitude"], args["longitude"])
        info = (
            f"<h6>Current weather</h6>"
            f"Temperature: {self.value['temperature_2m']}°C<br>"
            f"Wind: {self.value['wind_speed_10m']} m/s<br>"
            f"Time: {self.value['time']}"
        )

        m = Map(center=loc, zoom=10)
        m.add_layer(
            CircleMarker(location=loc, popup=ipywidgets.HTML(info))
        )

        register_widget(self.id, m)
        return output_widget(self.id)
```

</details>


</DOCUMENTATION>
