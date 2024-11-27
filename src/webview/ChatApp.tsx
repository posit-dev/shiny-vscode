import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type {
  Message,
  ToWebviewStateMessage,
} from "../../src/assistant/extension";

const SendIcon = () => (
  <svg
    viewBox='0 0 24 24'
    width='1em'
    height='1em'
    stroke='currentColor'
    fill='none'
    strokeWidth='2'
    strokeLinecap='round'
    strokeLinejoin='round'
  >
    <path d='M22 2L11 13' />
    <path d='M22 2L15 22L11 13L2 9L22 2Z' />
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
    <div className={`${isUser ? "justify-end" : "justify-start"} mb-2`}>
      <div
        className={`py-1 mx-2 ${isUser ? "msg-user px-2 rounded-sm" : "msg-assistant"}`}
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
    <div
      className={`flex flex-col h-full p-1 pt-2 ${hasUserMessages ? "" : "justify-start"}`}
    >
      {!hasApiKey ? (
        <div className='text-center p-4'>
          <p>
            To use Shiny Assistant, please set your Anthropic API key in VS Code
            settings:
          </p>
          <p className='text-sm text-gray-500 mt-2'>
            Settings → Extensions → Shiny → Assistant → Anthropic API Key
          </p>
        </div>
      ) : (
        <>
          {hasUserMessages && (
            <div className={"flex-1 overflow-y-auto"}>
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
                <div className='text-gray-500 italic'>Bot is thinking...</div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          <form onSubmit={handleSubmit} className={`flex`}>
            <div className='input-textbox-container flex-1 relative rounded-sm'>
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder='Type your message...'
                className='input-textbox w-full px-2 py-1 pr-8'
                rows={1}
              />
              <button
                type='button'
                onClick={sendMessage}
                className='input-send-button p-1 rounded-sm absolute m-1 right-0 bottom-0'
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
