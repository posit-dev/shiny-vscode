{{!
/*
from https://github.com/posit-dev/py-shiny/tree/58e82de55683435c8f7ab852978cf454131cd5ab/


Note: replace [star][star] below with asterisk characters!
The parser for squirrelly thinks this comment ends when there's a star-slash.
cd shiny/templates/chat
npx repomix . --copy --top-files-len 100 --ignore "[star][star]/_template.json,[star][star]/template.env"

The result is automatically copied to the clipboard, and then pasted here.
*/
}}
<DOCUMENTATION PACKAGE="shiny" LABEL="chat examples">

This file is a merged representation of a subset of the codebase, containing files not matching ignore patterns, combined into a single document by Repomix.

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
- Files matching these patterns are excluded: **/_template.json, **/template.env
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Files are sorted by Git change count (files with more changes are at the bottom)
</notes>

<additional_info>

</additional_info>

</file_summary>

<directory_structure>
llm-enterprise/
  aws-bedrock-anthropic/
    app_utils.py
    app.py
    requirements.txt
  azure-openai/
    app_utils.py
    app.py
    requirements.txt
llms/
  anthropic/
    app_utils.py
    app.py
    requirements.txt
  google/
    app_utils.py
    app.py
    requirements.txt
  langchain/
    app_utils.py
    app.py
    requirements.txt
  ollama/
    app.py
    requirements.txt
  openai/
    app_utils.py
    app.py
    requirements.txt
  playground/
    app_utils.py
    app.py
    requirements.txt
</directory_structure>

<files>
This section contains the contents of the repository's files.

<file path="llm-enterprise/aws-bedrock-anthropic/app_utils.py">
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
</file>

<file path="llm-enterprise/aws-bedrock-anthropic/app.py">
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
chat_client = ChatBedrockAnthropic(
    model="anthropic.claude-3-sonnet-20240229-v1:0",
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
    response = await chat_client.stream_async(user_input)
    await chat.append_message_stream(response)
</file>

<file path="llm-enterprise/aws-bedrock-anthropic/requirements.txt">
shiny
python-dotenv
chatlas
anthropic[bedrock]
</file>

<file path="llm-enterprise/azure-openai/app_utils.py">
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
</file>

<file path="llm-enterprise/azure-openai/app.py">
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
chat_client = ChatAzureOpenAI(
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
    response = await chat_client.stream_async(user_input)
    await chat.append_message_stream(response)
</file>

<file path="llm-enterprise/azure-openai/requirements.txt">
shiny
python-dotenv
chatlas
openai
</file>

<file path="llms/anthropic/app_utils.py">
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
</file>

<file path="llms/anthropic/app.py">
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
chat_client = ChatAnthropic(
    api_key=os.environ.get("ANTHROPIC_API_KEY"),
    model="claude-3-7-sonnet-latest",
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
    response = await chat_client.stream_async(user_input)
    await chat.append_message_stream(response)
</file>

<file path="llms/anthropic/requirements.txt">
shiny
python-dotenv
tokenizers
chatlas
anthropic
</file>

<file path="llms/google/app_utils.py">
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
</file>

<file path="llms/google/app.py">
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
chat_client = ChatGoogle(
    api_key=os.environ.get("GOOGLE_API_KEY"),
    system_prompt="You are a helpful assistant.",
    model="gemini-2.0-flash",
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
    response = await chat_client.stream_async(user_input)
    await chat.append_message_stream(response)
</file>

<file path="llms/google/requirements.txt">
shiny
python-dotenv
chatlas>=0.4.0
google-genai
</file>

<file path="llms/langchain/app_utils.py">
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
</file>

<file path="llms/langchain/app.py">
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
chat_client = ChatOpenAI(
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
    response = chat_client.astream(user_input)

    async def stream_wrapper():
        async for item in response:
            yield item.content

    await chat.append_message_stream(stream_wrapper())
</file>

<file path="llms/langchain/requirements.txt">
shiny
python-dotenv
langchain-openai
</file>

<file path="llms/ollama/app.py">
# ------------------------------------------------------------------------------------
# A basic Shiny Chat example powered by Ollama.
# ------------------------------------------------------------------------------------

from chatlas import ChatOllama

from shiny.express import ui

# ChatOllama() requires an Ollama model server to be running locally.
# See the docs for more information on how to set up a local Ollama server.
# https://posit-dev.github.io/chatlas/reference/ChatOllama.html
chat_client = ChatOllama(model="llama3.2")

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
    response = await chat_client.stream_async(user_input)
    await chat.append_message_stream(response)
</file>

<file path="llms/ollama/requirements.txt">
shiny
chatlas
ollama
</file>

<file path="llms/openai/app_utils.py">
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
</file>

<file path="llms/openai/app.py">
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
chat_client = ChatOpenAI(
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
    response = await chat_client.stream_async(user_input)
    await chat.append_message_stream(response)
</file>

<file path="llms/openai/requirements.txt">
shiny
python-dotenv
chatlas
openai
</file>

<file path="llms/playground/app_utils.py">
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
</file>

<file path="llms/playground/app.py">
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
    "claude": [
        "claude-3-7-sonnet-latest",
        "claude-3-opus-latest",
        "claude-3-haiku-20240307",
    ],
    "openai": ["gpt-4o-mini", "gpt-4o"],
    "google": ["gemini-2.0-flash"],
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
        chat_client = ctl.ChatOpenAI(**model_params)
    elif input.model() in models["claude"]:
        chat_client = ctl.ChatAnthropic(**model_params)
    elif input.model() in models["google"]:
        chat_client = ctl.ChatGoogle(**model_params)
    else:
        raise ValueError(f"Invalid model: {input.model()}")

    return chat_client


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
</file>

<file path="llms/playground/requirements.txt">
chatlas>=0.4
openai
anthropic
google-genai
python-dotenv
shiny
</file>

</files>


</DOCUMENTATION>
