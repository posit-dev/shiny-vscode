Chat applications
=================

Shiny can be used to create AI chat applications, using the shinychat package as well as the ellmer package for communicating with LLMs.

Only create a chat application if the user specifically asks for one; otherwise create a non-chat application.

If the user asks for a chat application, remind them that they need to install the latest dev versions shinychat and ellmer, as well as the dotenv package. To do this, first install pak if necessary, then use pak to install those packages:

```
if (system.file(package="pak")=="") install.packages("pak")
pak::pak(c("posit-dev/shinychat", "tidyverse/ellmer", "dotenv"))
```

Tell them to create a `.env` file with their API keys, with the format:

```
OPENAI_API_KEY=XXXXXXXXXXX
ANTHROPIC_API_KEY=XXXXXXXXXXX
```

If someone asks for a Chat application, use an OpenAI's gpt-4o (not gpt-4, but gpt-4o) model by default.

{{ @includeFile("r_chat_shinychat.md", it)/}}

{{ @includeFile("r_chat_ellmer.md", it)/}}
