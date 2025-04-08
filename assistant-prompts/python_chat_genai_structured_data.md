{{!
/* from https://github.com/posit-dev/py-shiny-site/blob/f86dbfd9a60f0a23351119eb33df8a14f6f02b1f/docs/genai-structured-data.qmd */
}}

<DOCUMENTATION LABEL="Shiny Chatbots structured data">
LLMs are quite good at extracting structured data from unstructured text, images, etc.
Though not always perfect, this can be a very helpful way to reduce the amount of manual work needed to extract information from a large amount of text or documents.
Here are just a few scenarios where this can be useful:

1. **Form processing**: Extract structured field-value pairs from scanned documents, invoices, and forms to reduce manual data entry.
2. **Automated table extraction**: Identify and extract tables from unstructured text and images.
3. **Sentiment analysis**: Extract sentiment scores and associated entities from customer reviews or social media posts to gain insights into public opinion.
4. **Classification**: Classify text into predefined categories, such as spam detection or topic classification.
5. **Executive summaries**: Extract key points and structured data from lengthy reports or articles to create concise summaries for decision-makers.

## Intro to `.extract_data()`

The [`chatlas` package](https://posit-dev.github.io/chatlas/) provides a simple way to extract structured data: the [`.extract_data()` method](https://posit-dev.github.io/chatlas/reference/Chat.html#chatlas.Chat.extract_data).
To use it, you'll need three things:

1. Pick a [model provider](https://posit-dev.github.io/chatlas/reference/) (e.g., `ChatOpenAI()`).
2. Define a data model by subclassing `pydantic`'s `BaseModel` class.
    - Here you'll define the fields and value types you're expecting in the input.
3. Pass the unstructured input and `data_model` to the `.extract_data()` method.

```python
from chatlas import ChatOpenAI
from pydantic import BaseModel

class Person(BaseModel):
    name: str
    age: int

chat_client = ChatOpenAI()
chat_client.extract_data(
  "My name is Susan and I'm 13 years old",
  data_model=Person,
)
```

`.extract_data()` then returns a dictionary matching the fields and types in the `data_model`:

```python
{'name': 'Susan', 'age': 13}
```


::: callout-note
### More examples

For more examples and details on how `.extract_data()` works, see the [chatlas documentation](https://posit-dev.github.io/chatlas/structured-data.html).
:::

::: callout-tip
### Multi-modal input

`chatlas` also supports input other than text, such as images ([`content_image_file()`](https://posit-dev.github.io/chatlas/reference/content_image_file.html)) and PDF ([`content_pdf_file()`](https://posit-dev.github.io/chatlas/reference/content_pdf_file.html)).
:::

## Basic app

To go from this basic script to a Shiny app, you'll at least want a couple things:

* Change `.extract_data()` to `await chat_client.extract_data_async()`.
    - This helps the Shiny app scale efficiently to multiple concurrent users.
    - You could also wrap this part in a [non-blocking task](nonblocking.qmd) to keep the rest of the app responsive within the same session.

* Decide how the user will provide and/or navigate the unstructured input(s).
    - This could be a simple text input field (as below), a [file upload](../api/express/express.ui.input_file.qmd), a [chat interface](genai-chatbots.qmd), etc.

For now, let's keep it simple and use a text input field:

<details open>
<summary> <code>app.py</code> </summary>

```python
from chatlas import ChatOpenAI
from pydantic import BaseModel

from shiny import reactive
from shiny.express import input, render, ui

chat_client = ChatOpenAI()

class Person(BaseModel):
    name: str
    age: int

with ui.card():
    ui.card_header("Enter some input with name and age")
    ui.input_text_area(
        "user_input", None, update_on="blur", width="100%",
        value="My name is Susan and I'm 13 years old",
    )
    ui.input_action_button("submit", label="Extract data")

    @render.ui
    @reactive.event(input.submit)
    async def result():
        return ui.markdown(f"Extracted data: `{await data()}`")

@reactive.calc
async def data():
    return await chat_client.extract_data_async(
        input.user_input(),
        data_model=Person,
    )
```

</details>


![Screenshot of the basic structured data app](/images/genai-structured-basic.png){class="rounded shadow mb-5"}


## Editable data

Remember that the LLM is not perfect -- you may want to manually correct or refine the extracted data.
In this scenario, it may be useful to allow the user to edit the extracted data, and download it when they are done.
Here's an example of how to do this in a named entity extraction app.

<details>
<summary> <code>data_model.py</code> </summary>

```python
from pydantic import BaseModel, Field

class NamedEntity(BaseModel):
    """Named entity in the text."""

    name: str = Field(description="The extracted entity name")

    type_: str = Field(
        description="The entity type, e.g. 'person', 'location', 'organization'"
    )

    context: str = Field(
        description="The context in which the entity appears in the text."
    )

class NamedEntities(BaseModel):
    """Named entities in the text."""

    entities: list[NamedEntity] = Field(description="Array of named entities")

_ = NamedEntities.model_rebuild()
```

</details>


<details>
<summary> <code>app.py</code> </summary>

```python
import pandas as pd
from chatlas import ChatOpenAI
from faicons import icon_svg

from shiny import reactive
from shiny.express import input, render, ui

from data_model import NamedEntities

chat_client = ChatOpenAI()

with ui.card():
    ui.card_header("Named Entity Extraction")
    ui.input_text_area(
        "user_input", None, update_on="blur", width="100%",
        value="John works at Google in New York. He met with Sarah, the CEO of Acme Inc., last week in San Francisco.",
    )
    ui.input_action_button("submit", label="Extract", icon=icon_svg("paper-plane"))

with ui.card():
    with ui.card_header(class_="d-flex justify-content-between align-items-center"):
        "Extracted (editable) table"

        @render.download(filename="entities.csv", label="Download CSV")
        async def download():
            d = await data()
            yield d.to_csv(index=False)

    @render.data_frame
    async def data_frame():
        return render.DataGrid(
            await data(),
            editable=True,
            width="100%",
        )

@reactive.calc
@reactive.event(input.user_input)
async def data():
    d = await chat_client.extract_data_async(
        input.user_input(),
        data_model=NamedEntities,
    )
    df = pd.DataFrame(d["entities"])
    return df.rename(columns={"type_": "type"})
```

</details>
</DOCUMENTATION>
