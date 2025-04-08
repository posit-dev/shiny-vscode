{{!
/* from https://github.com/posit-dev/chatlas/blob/227b5a6f1c1ac870033ba993fb96675451b67e16/docs/web-apps.qmd */
}}

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
