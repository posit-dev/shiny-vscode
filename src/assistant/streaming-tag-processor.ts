type ProcessedText = {
  type: "text";
  text: string;
};

type ProcessedTag = {
  type: "tag";
  name: string;
  kind: "open" | "close";
  attributes: Record<string, string>;
};

export class StreamingTagProcessor {
  private buffer: string = "";
  private readonly tagPatterns: RegExp[];
  private readonly closingTagPatterns: RegExp[];

  /**
   * Creates a new StreamingTagProcessor that looks for specified XML-style tags.
   * @param tagNames - Array of tag names without angle brackets or attributes
   *                  (e.g., ["SHINYAPP", "FILE"])
   */
  constructor(tagNames: string[]) {
    // Match opening tags with optional attributes
    this.tagPatterns = tagNames.map((tagName) => {
      return new RegExp(`<${tagName}(?:\\s+[^>]*)?>`);
    });
    // Match closing tags
    this.closingTagPatterns = tagNames.map((tagName) => {
      return new RegExp(`</${tagName}>`);
    });
  }

  private parseAttributes(tagContent: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const matches = tagContent.matchAll(/(\w+)="([^"]*)"/g);
    for (const match of matches) {
      if (match[1] && match[2] !== undefined) {
        attributes[match[1]] = match[2];
      }
    }
    return attributes;
  }

  /**
   * Processes a chunk of text to identify and handle specific tags. Accumulates
   * text until a complete tag is found, then returns the text before the tag.
   * If no complete tag is found, keeps the text in the buffer for the next
   * call.
   *
   * @param chunk - The chunk of text to process.
   * @returns - The text before the tag or potential tag, or an empty string if
   * there is no such text.
   */
  process(chunk: string): Array<ProcessedText | ProcessedTag> {
    this.buffer += chunk;
    const result: Array<ProcessedText | ProcessedTag> = [];

    let currentIndex = 0;
    let potentialTagStart = this.buffer.indexOf("<", currentIndex);

    while (potentialTagStart !== -1) {
      // Add text before potential tag to result, if there was any
      if (potentialTagStart > currentIndex) {
        result.push({
          type: "text",
          text: this.buffer.slice(currentIndex, potentialTagStart),
        });
        // this.buffer = this.buffer.slice(potentialTagStart);
      }

      const potentialTagEnd = this.buffer.indexOf(">", potentialTagStart);

      if (potentialTagEnd === -1) {
        // No tag end found, keep remaining text in buffer
        this.buffer = this.buffer.slice(potentialTagStart);
        return result;
      }

      const potentialTag = this.buffer.slice(
        potentialTagStart,
        potentialTagEnd + 1
      );

      // First check if it's a closing tag
      const matchedClosingPattern = this.closingTagPatterns.find((pattern) =>
        pattern.test(potentialTag)
      );

      if (matchedClosingPattern) {
        const tagName = matchedClosingPattern.source.match(/<\\\/(\w+)/)![1];

        result.push({
          type: "tag",
          name: tagName,
          attributes: {},
          kind: "close",
        });

        currentIndex = potentialTagEnd + 1;
      } else {
        // Check if it's an opening tag
        const matchedPattern = this.tagPatterns.find((pattern) =>
          pattern.test(potentialTag)
        );

        if (matchedPattern) {
          const tagName = matchedPattern.source.match(/<(\w+)/)![1];

          const attributesPart = potentialTag
            .slice(tagName.length + 2, -1)
            .trim();

          result.push({
            type: "tag",
            name: tagName,
            attributes: this.parseAttributes(attributesPart),
            kind: "open",
          });

          currentIndex = potentialTagEnd + 1;
        } else if (this.couldBeIncompleteMatch(potentialTag)) {
          this.buffer = this.buffer.slice(currentIndex);
          return result;
        } else {
          result.push({
            type: "text",
            text: potentialTag,
          });
          currentIndex = potentialTagEnd + 1;
        }
      }

      potentialTagStart = this.buffer.indexOf("<", currentIndex);
    }

    // Add remaining text if any
    if (currentIndex < this.buffer.length) {
      result.push({
        type: "text",
        text: this.buffer.slice(currentIndex),
      });
      this.buffer = "";
    } else if (currentIndex === this.buffer.length) {
      this.buffer = "";
    }

    return result;
  }

  private couldBeIncompleteMatch(partial: string): boolean {
    return [...this.tagPatterns, ...this.closingTagPatterns].some((pattern) => {
      const patternStr = pattern.source;
      const partialPattern = new RegExp(
        "^" + partial.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      );
      return partialPattern.test(patternStr);
    });
  }

  flush(): string | null {
    if (this.buffer.length === 0) {
      return null;
    }
    const result = this.buffer;
    this.buffer = "";
    return result;
  }
}
