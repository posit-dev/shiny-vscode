import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type {
  Message,
  ToWebviewStateMessage,
} from "../../src/assistant/extension";
import { inferFileType } from "../assistant/utils";
import CodeBlock from "./CodeBlock";

const SendIcon = () => (
  <svg
    viewBox='0 0 24 22'
    width='1em'
    height='1em'
    stroke='currentColor'
    fill='none'
    strokeWidth='2'
    strokeLinecap='round'
    strokeLinejoin='round'
  >
    <path d='M23 1L12 12' />
    <path d='M23 1L16 21L12 12L3 8L23 1Z' />
  </svg>
);

const vscode = acquireVsCodeApi();

// When the webview loads, ask the extension for the current state
vscode.postMessage({ type: "getState" });

// Send messages to the extension
const sendMessageToExtension = (message: string) => {
  vscode.postMessage({ type: "userInput", content: message });
};

/**
 * Processes Shiny app code blocks in the content and converts them to markdown
 * format. Handles unmatched tags during streaming by adding missing closing
 * tags (the tags may be unmatched during streaming).
 *
 * Input format:
 * ```
 * <SHINYAPP AUTORUN="1">
 * <FILE NAME="app.py">
 * code content
 * </FILE>
 * </SHINYAPP>
 * ```
 *
 * Output format:
 * ```
 * **app.py**
 * ```python
 * code content
 * ```
 * ```
 *
 * @param content - The text content containing Shiny app code blocks
 * @returns The processed content with Shiny app blocks converted to markdown
 */
const processShinyAppBlocks = (content: string): Array<JSX.Element> => {
  // Add missing closing tags if needed
  let contentWithClosingTags = content;

  // Count opening and closing SHINYAPP tags
  const shinyAppOpenCount = (content.match(/<SHINYAPP AUTORUN="[01]">/g) || [])
    .length;
  const shinyAppCloseCount = (content.match(/<\/SHINYAPP>/g) || []).length;

  // Count opening and closing FILE tags
  const fileOpenCount = (content.match(/<FILE NAME="[^"]+?">/g) || []).length;
  const fileCloseCount = (content.match(/<\/FILE>/g) || []).length;

  // Add missing FILE closing tags
  if (fileOpenCount > fileCloseCount) {
    const missingCloseTags = fileOpenCount - fileCloseCount;
    for (let i = 0; i < missingCloseTags; i++) {
      contentWithClosingTags += "</FILE>";
    }
  }

  // Add missing SHINYAPP closing tags
  if (shinyAppOpenCount > shinyAppCloseCount) {
    const missingCloseTags = shinyAppOpenCount - shinyAppCloseCount;
    for (let i = 0; i < missingCloseTags; i++) {
      contentWithClosingTags += "</SHINYAPP>";
    }
  }

  const ShinyappTagRegex = /(<SHINYAPP AUTORUN="[01]">.*?<\/SHINYAPP>)/s;

  const chunksStrings = contentWithClosingTags.split(ShinyappTagRegex);
  const chunksJsxElements: Array<JSX.Element> = [];

  let keyIndex = 0;
  for (const chunk of chunksStrings) {
    if (ShinyappTagRegex.test(chunk)) {
      // If we're here, it's a <SHINYAPP> tag, with <FILE NAME="..."> tags
      // inside of it.
      const fileMatches = chunk.matchAll(/<FILE NAME="[^"]+">.*?<\/FILE>/gs);
      const files = Array.from(fileMatches).map((match) => match[0]);

      for (const file of files) {
        const nameMatch = file.match(/<FILE NAME="([^"]+)">/);
        const fileName = nameMatch ? nameMatch[1] : "file.txt";
        const fileContent = file.replace(
          /<FILE NAME="[^"]+">\n?(.*?)<\/FILE>/s,
          "$1"
        );

        chunksJsxElements.push(
          <CodeBlock
            key={keyIndex}
            filename={fileName}
            code={fileContent}
            language={inferFileType(fileName)}
          />
        );
        keyIndex++;
      }
    } else {
      // Plain string; process it as Markdown.
      chunksJsxElements.push(
        <ReactMarkdown key={keyIndex}>{chunk}</ReactMarkdown>
      );
      keyIndex++;
    }
  }

  return chunksJsxElements;
};

const ChatMessage = ({
  message,
  role,
}: {
  message: string;
  role: "assistant" | "user";
}) => {
  const isUser = role === "user";
  return (
    <div
      className={`chat-message ${isUser ? "chat-message-user" : "chat-message-assistant"}`}
    >
      <div
        className={`message-content ${isUser ? "msg-user" : "msg-assistant"}`}
      >
        {processShinyAppBlocks(message)}
      </div>
    </div>
  );
};

const ChatApp = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasUserMessages = messages.some((message) => message.role === "user");

  useEffect(() => {
    // On load, adjust the textarea height.
    if (textareaRef.current) {
      adjustTextareaHeight(textareaRef.current);
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const messageHandler = (event: MessageEvent) => {
      const msg = event.data;

      if (msg.type === "currentState") {
        const data = msg.data as ToWebviewStateMessage;
        setMessages(data.messages);
        setHasApiKey(data.hasApiKey);
        if (
          data.messages.length > 0 &&
          data.messages[data.messages.length - 1].role !== "user"
        ) {
          setIsThinking(false);
        }
      } else if (msg.type === "streamContent") {
        setMessages((prevMessages) => {
          const newMessages = [...prevMessages];
          if (newMessages.length < msg.data.messageIndex + 1) {
            newMessages.push({
              content: "",
              role: "assistant",
            });
          }
          newMessages[msg.data.messageIndex].content = msg.data.content;
          return newMessages;
        });
        setIsThinking(false);
      } else {
        console.log("Webview received unknown message: ", msg);
      }
    };

    window.addEventListener("message", messageHandler);

    // Cleanup function to remove event listener
    return () => {
      window.removeEventListener("message", messageHandler);
    };
  }, [messages]);

  const sendMessage = () => {
    if (!inputText.trim()) return;

    const userInputMessage: Message = {
      content: inputText,
      role: "user",
    };

    // Add user message
    const newMessages: Array<Message> = [...messages, userInputMessage];
    setMessages(newMessages);
    setInputText("");
    setIsThinking(true);

    sendMessageToExtension(inputText);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    sendMessage();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const adjustTextareaHeight = (element: HTMLTextAreaElement) => {
    element.style.height = "1px";
    element.style.height = `${element.scrollHeight + 2}px`;
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    adjustTextareaHeight(e.target);
  };

  return (
    <div className={`chat-container ${hasUserMessages ? "" : "justify-start"}`}>
      {!hasApiKey ? (
        <div className='api-key-message'>
          <p>
            To use Shiny Assistant, please set your Anthropic API key in VS Code
            settings:
          </p>
          <p className='api-key-instructions'>
            Settings → Extensions → Shiny → Assistant → Anthropic API Key
          </p>
        </div>
      ) : (
        <>
          {hasUserMessages && (
            <div className='chat-messages'>
              {messages
                .filter((message) => {
                  return (
                    message.role === "user" || message.role === "assistant"
                  );
                })
                .map((message, index) => {
                  return (
                    <ChatMessage
                      key={index}
                      message={message.content}
                      role={message.role as "assistant" | "user"}
                    />
                  );
                })}
              {isThinking && <div className='thinking-message'>...</div>}
              <div ref={messagesEndRef} />
            </div>
          )}

          <form onSubmit={handleSubmit} className='chat-form'>
            <div className='input-textbox-container '>
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder='Type your message...'
                className='input-textbox'
                rows={1}
              />
              <button
                type='button'
                onClick={sendMessage}
                className='input-send-button'
                disabled={!inputText.trim()}
              >
                <SendIcon />
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
};

export default ChatApp;
