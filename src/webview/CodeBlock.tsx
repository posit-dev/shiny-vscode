import React from "react";
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
  return (
    <div className='code-block'>
      <div className='filename'>{filename}</div>
      <SyntaxHighlighter
        language={language}
        style={vs}
        customStyle={{
          backgroundColor: undefined,
          margin: 0,
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
