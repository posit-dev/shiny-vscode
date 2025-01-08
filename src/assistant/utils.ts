export function inferFileType(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  switch (ext) {
    case ".py":
      return "python";
    case ".r":
      return "r";
    default:
      return "text";
  }
}

// Calculate the text delta between two strings, using backspace characters for deletions
export function calculateTextDelta(
  oldContent: string,
  newContent: string
): string {
  // Find the common prefix length
  let i = 0;
  while (
    i < oldContent.length &&
    i < newContent.length &&
    oldContent[i] === newContent[i]
  ) {
    i++;
  }

  // Calculate deletion length (from end of common prefix to end of old content)
  const deleteLength = oldContent.length - i;

  // Calculate insertion text (from end of common prefix to end of new content)
  const insertText = newContent.slice(i);

  return deleteLength > 0 ? `\b`.repeat(deleteLength) + insertText : insertText;
}

// Apply a text delta (with backspace characters) to the original content
export function applyTextDelta(content: string, delta: string): string {
  // Count backspaces at the start of delta
  let backspaceCount = 0;
  while (backspaceCount < delta.length && delta[backspaceCount] === "\b") {
    backspaceCount++;
  }

  let contentAfterBackspaces = content;
  // Special case backspaceCount===0, since .slice(0, 0) just returns an empty
  // string.
  if (backspaceCount > 0) {
    contentAfterBackspaces = content.slice(0, -backspaceCount);
  }

  return contentAfterBackspaces + delta.slice(backspaceCount);
}
