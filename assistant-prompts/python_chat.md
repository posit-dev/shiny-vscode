Chat applications
=================

Shiny can be used to create AI chat applications, using the built-in `ui.Chat()` component as well as the chatlas package for communicating with LLMs.

Only create a Chat application if the user specifically asks for one; otherwise create a non-Chat application.

Remind them that they should run `pip install -r requirements.txt` to install the packages.

If the user wants a chat application, tell them that they can check the version of Shiny by running this and checking that it's "1.3.0" or higher.

```
python -c "import shiny; print(shiny.__version__)"
```

If they need to install a newer version of shiny and/or chatlas, tell them to run:

```
pip install --upgrade shiny chatlas
```

Note that for Chat applications, you should use Shiny Express syntax by default. Many of the examples in the documentation below use Shiny Express syntax.

Pay very close attention to the chatlas documentation and Shiny example in it. Where there are differences between the chatlas API and the regular Shiny chat API, use the chatlas API instead, from that example.

If someone asks for a Chat application, use an OpenAI's gpt-4o (not gpt-4, but gpt-4o) model by default.

This is the Shiny Chat documentation:

{{ @includeFile("python_chat_genai_chatbots.md", it)/}}

{{ @includeFile("python_chat_genai_tools.md", it)/}}

{{ @includeFile("python_chat_genai_stream.md", it)/}}

{{ @includeFile("python_chat_genai_structured_data.md", it)/}}


Here is chatlas's documentation on using it with Shiny.


{{ @includeFile("python_chat_chatlas_shiny.md", it)/}}


Here are some examples of Shiny chat applications.

{{ @includeFile("python_chat_shiny_examples.md", it)/}}

