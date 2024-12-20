import React, { useEffect, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  vs,
  vscDarkPlus,
} from "react-syntax-highlighter/dist/esm/styles/prism";

interface CodeBlockProps {
  filename?: string;
  code: string;
  language?: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({
  filename = "",
  code,
  language = "text",
}) => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const updateTheme = () => {
      const isDark = document.body.classList.contains("vscode-dark");
      setIsDarkMode(isDark);
    };

    updateTheme();

    // Watch for changes to body class
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className='code-block'>
      <div className='filename'>{filename}</div>
      <SyntaxHighlighter
        language={language}
        style={isDarkMode ? vscDarkPlus : vs}
        customStyle={{
          backgroundColor: undefined,
          margin: 0,
          fontSize: undefined,
          lineHeight: undefined,
          fontFamily: undefined,
          border: "none",
        }}
        codeTagProps={{
          style: {
            fontFamily: undefined,
          },
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
};

export default CodeBlock;
