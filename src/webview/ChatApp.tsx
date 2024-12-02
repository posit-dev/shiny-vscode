import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type {
  Message,
  ToWebviewStateMessage,
} from "../../src/assistant/extension";

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
        {role === "assistant" ? (
          <ReactMarkdown>{message}</ReactMarkdown>
        ) : (
          <p>{message}</p>
        )}
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
              {isThinking && (
                <div className='thinking-message'>Bot is thinking...</div>
              )}
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
