type ProcessedText = {
  type: "text";
  text: string;
};

type ProcessedTag = {
  type: "tag";
  name: string;
  kind: "open" | "close";
  attributes: Record<string, string>;
  originalText: string;
};

export class StreamingTagProcessor {
  private buffer: string = "";
  private readonly tagNames: string[];

  /**
   * Creates a new StreamingTagProcessor that looks for specified XML-style tags.
   * @param tagNames - Array of tag names without angle brackets or attributes
   *                  (e.g., ["SHINYAPP", "FILE"])
   */
  constructor(tagNames: string[]) {
    // TODO: Validate tag names
    this.tagNames = [...tagNames];
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

  // - For the not_tag case, return a ProcessedText object
  //  - For the ProcessedText and ProcessedTag cases, also return offset? Or
  //    remaining string?
  public processPotentialTagText(
    text: string
  ): "potential_tag" | ProcessedText | ProcessedTag {
    let state:
      | "INITIAL"
      | "TAG_START"
      | "TAG_START_SLASH"
      | "TAG_NAME"
      | "WHITESPACE"
      | "ATTRIBUTE"
      | "ATTRIBUTE_NAME"
      | "LOOKING_FOR_ATTRIBUTE_EQUALS"
      | "LOOKING_FOR_ATTRIBUTE_VALUE"
      | "IN_ATTRIBUTE_VALUE_DOUBLE_QUOTE"
      | "IN_ATTRIBUTE_VALUE_SINGLE_QUOTE"
      | "ATTRIBUTE_VALUE_END"
      | "TAG_END" = "INITIAL";

    // This is what to return if the text is not a tag -- the entire inttext as
    // a ProcessedText object.
    function notTagResult(): ProcessedText {
      return { type: "text", text: text };
    }

    let tagName: string = "";
    let kind: "open" | "close" | null = null;
    let currentAttributeName: string = "";
    let currentAttributeValue: string = "";
    const attributes: Record<string, string> = {};

    // Counter for iterating over a tag name character by character.
    let tagNameIdx = 0;
    const potentialTagNameMatches = [...this.tagNames];

    // Iterate over the characters in the text. Positive matches include:
    // "<", "<SH", "<SHINYAPP", "<SHINYAPP>", "<SHINYAPP ", "<SHINYAPP FOO",
    // "<SHINYAPP FOO=1", "<SHINYAPP FOO=1>"
    //
    // For negative matches, include:
    // "SHINYAPP", "< ", "<>", "<SHIN>","<X", "<SHINYAPPS"
    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (state === "INITIAL") {
        if (char === "<") {
          state = "TAG_START";
        } else {
          return { type: "text", text: text };
        }
      } else if (state === "TAG_START") {
        if (char === "/") {
          // We have "</"
          state = "TAG_START_SLASH";
        } else if (/^[a-zA-Z0-9]$/.test(char)) {
          // This is a valid starting character for a tag name
          // Iterate backward over the list of potentialTagNameMatches because we
          // may remove items as we go.
          for (let j = potentialTagNameMatches.length - 1; j >= 0; j--) {
            if (char !== potentialTagNameMatches[j][tagNameIdx]) {
              // Character mismatch: we can remove this tag name from the list of
              // potential matches.
              potentialTagNameMatches.splice(j, 1);
            }
          }

          if (potentialTagNameMatches.length === 0) {
            // Didn't match any tag names, as in "<Z"
            return "not_tag";
          }

          state = "TAG_NAME";
          tagName = char;
          kind = "open";
          tagNameIdx++;
        } else {
          // Not a valid tag name starting character
          return "not_tag";
        }
      } else if (state === "TAG_START_SLASH") {
        if (/^[a-zA-Z0-9]$/.test(char)) {
          for (let j = potentialTagNameMatches.length - 1; j >= 0; j--) {
            if (char !== potentialTagNameMatches[j][tagNameIdx]) {
              potentialTagNameMatches.splice(j, 1);
            }
          }

          if (potentialTagNameMatches.length === 0) {
            // Didn't match any tag names, as in "</Z"
            return "not_tag";
          }

          state = "TAG_NAME";
          tagName = char;
          kind = "close";
          tagNameIdx++;
        } else {
          // Not a valid tag name starting character
          return "not_tag";
        }
      } else if (state === "TAG_NAME") {
        // This state: We're in a tag name and have at least one character

        if (char === " " || char === ">") {
          // Filter out potentialTagNameMatches that aren't the correct length.
          // So if the potentialTagNameMatches are ["SHINY", "SHINYAPP"], and
          // the text up to here is "<SHINY>", we should remove "SHINYAPP" from
          // the potential matches. (For consistency, we're not using filter();
          // elsewhere in the code we're modifying the array in place.)
          for (let i = potentialTagNameMatches.length - 1; i >= 0; i--) {
            if (tagNameIdx !== potentialTagNameMatches[i].length) {
              potentialTagNameMatches.splice(i, 1);
            }
          }
          // If we hit the end of a tag name, we can transition to the next state.
          if (potentialTagNameMatches.length === 1) {
            if (char === " ") {
              // "<SHINYAPP "
              state = "WHITESPACE";
            } else if (char === ">") {
              // "<SHINYAPP>"
              state = "TAG_END";
            } else {
              // Shouldn't get here, throw error
              throw new Error(`Unexpected character: ${char}`);
            }
          } else {
            // If we got here, then it's something like "<SHIN>" or "<SHINYA "
            return "not_tag";
          }
        } else if (/^[a-zA-Z0-9_-]$/.test(char)) {
          for (let j = potentialTagNameMatches.length - 1; j >= 0; j--) {
            if (char !== potentialTagNameMatches[j][tagNameIdx]) {
              potentialTagNameMatches.splice(j, 1);
            }
          }

          if (potentialTagNameMatches.length === 0) {
            // Didn't match any tag names, as in "<SHINYX"
            return "not_tag";
          }

          tagName += char;
          tagNameIdx++;
        } else {
          // Not a valid tag name character, as in "<SHIN!"
          return "not_tag";
        }
      } else if (state === "WHITESPACE") {
        if (/^[a-zA-Z0-9]$/.test(char)) {
          // TODO: Closing tags shouldn't have attributes
          // Could be the start of an attribute name
          state = "ATTRIBUTE_NAME";
          currentAttributeName = char;
        } else if (char === " ") {
          // Stay in this state
        } else if (char === ">") {
          state = "TAG_END";
        } else {
          // Invalid character - we're not in a tag
          return "not_tag";
        }
      } else if (state === "ATTRIBUTE_NAME") {
        if (/^[a-zA-Z0-9_-]$/.test(char)) {
          // Stay in this state
          currentAttributeName += char;
        } else if (char === " ") {
          state = "LOOKING_FOR_ATTRIBUTE_EQUALS";
        } else if (char === "=") {
          state = "LOOKING_FOR_ATTRIBUTE_VALUE";
        } else {
          // Invalid character
          return "not_tag";
        }
      } else if (state === "LOOKING_FOR_ATTRIBUTE_EQUALS") {
        if (char === " ") {
          // Stay in this state
        } else if (char === "=") {
          state = "LOOKING_FOR_ATTRIBUTE_VALUE";
        } else {
          // Invalid character
          return "not_tag";
        }
      } else if (state === "LOOKING_FOR_ATTRIBUTE_VALUE") {
        if (char === " ") {
          // Stay in this state
        } else if (char === '"') {
          // Found opening quote - now we're in the attribute value
          state = "IN_ATTRIBUTE_VALUE_DOUBLE_QUOTE";
          currentAttributeValue = "";
        } else if (char === "'") {
          state = "IN_ATTRIBUTE_VALUE_SINGLE_QUOTE";
          currentAttributeValue = "";
        } else {
          return "not_tag";
        }
      } else if (state === "IN_ATTRIBUTE_VALUE_DOUBLE_QUOTE") {
        if (char === '"') {
          // Found closing quote. Save the attribute name-value pair and reset
          // the accumulators.
          state = "ATTRIBUTE_VALUE_END";
          attributes[currentAttributeName] = currentAttributeValue;
          currentAttributeName = "";
          currentAttributeValue = "";
        } else if (char === ">") {
          // The attribute value shouldn't have a ">". Those should be escaped.
          return "not_tag";
        } else {
          currentAttributeValue += char;
        }
      } else if (state === "IN_ATTRIBUTE_VALUE_SINGLE_QUOTE") {
        // This block behaves the same as the double-quote block above.
        if (char === "'") {
          state = "ATTRIBUTE_VALUE_END";
          attributes[currentAttributeName] = currentAttributeValue;
          currentAttributeName = "";
          currentAttributeValue = "";
        } else if (char === ">") {
          return "not_tag";
        } else {
          currentAttributeValue += char;
        }
      } else if (state === "ATTRIBUTE_VALUE_END") {
        if (char === " ") {
          state = "WHITESPACE";
        } else if (char === ">") {
          state = "TAG_END";
        } else {
          return "not_tag";
        }
      }

      // We found a complete tag!
      if (state === "TAG_END") {
        return {
          type: "tag",
          name: tagName,
          kind: kind!,
          attributes,
        };
      }
    }
    // If we've exited the loop without an  early return, that means we're still
    // in a potential tag.
    return "potential_tag";
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

    let potentialTagStart = this.buffer.indexOf("<");

    // No potential tag in the text; return the entire buffer and clear it.
    // TODO: Maybe move this to the end?
    if (potentialTagStart === -1) {
      result.push({
        type: "text",
        text: this.buffer,
      });
      this.buffer = "";
      return result;
    }

    while (potentialTagStart !== -1) {
      // Add text before potential tag to result, if there was any
      if (potentialTagStart > 0) {
        result.push({
          type: "text",
          text: this.buffer.slice(0, potentialTagStart),
        });
        // Trim that leading text from the buffer
        this.buffer = this.buffer.slice(potentialTagStart);
        potentialTagStart = 0;
      }

      // At this point, the buffer starts with "<"
      const startsWithTagResult = this.processPotentialTagText(this.buffer);

      potentialTagStart = this.buffer.indexOf("<");
    }

    // // TODO: is this test correct?
    // while (potentialTagStart !== -1) {
    //   // Add text before potential tag to result, if there was any
    //   if (potentialTagStart > currentIndex) {
    //     result.push({
    //       type: "text",
    //       text: this.buffer.slice(currentIndex, potentialTagStart),
    //     });
    //     currentIndex = potentialTagStart;
    //   }

    //   const potentialTagText = this.buffer.slice(currentIndex);
    //   const startsWithTagResult = this.startsWithTag(potentialTagText);
    //   // If it is
    //   if (startsWithTagResult === "not_tag") {
    //     result.push({
    //       type: "text",
    //       text: this.buffer.slice(currentIndex, potentialTagStart),
    //     });
    //   } else if (startsWithTagResult === "potential_tag") {
    //   } else {
    //     // We have a complete tag
    //     result.push(startsWithTagResult);
    //     currentIndex = potentialTagStart + startsWithTagResult.text.length;
    //   }

    // const potentialTagEnd = this.buffer.indexOf(">", potentialTagStart);

    // if (potentialTagEnd === -1) {
    //   // No tag end found, keep remaining text in buffer
    //   this.buffer = this.buffer.slice(potentialTagStart);
    //   return result;
    // }

    // const potentialTag = this.buffer.slice(
    //   potentialTagStart,
    //   potentialTagEnd + 1
    // );

    // // First check if it's a closing tag
    // const matchedClosingPattern = this.closingTagPatterns.find((pattern) =>
    //   pattern.test(potentialTag)
    // );

    // if (matchedClosingPattern) {
    //   const tagName = matchedClosingPattern.source.match(/<\\\/(\w+)/)![1];

    //   result.push({
    //     type: "tag",
    //     name: tagName,
    //     attributes: {},
    //     kind: "close",
    //   });

    //   currentIndex = potentialTagEnd + 1;
    // } else {
    //   // Check if it's an opening tag
    //   const matchedPattern = this.tagPatterns.find((pattern) =>
    //     pattern.test(potentialTag)
    //   );

    //   if (matchedPattern) {
    //     const tagName = matchedPattern.source.match(/<(\w+)/)![1];

    //     const attributesPart = potentialTag
    //       .slice(tagName.length + 2, -1)
    //       .trim();

    //     result.push({
    //       type: "tag",
    //       name: tagName,
    //       attributes: this.parseAttributes(attributesPart),
    //       kind: "open",
    //     });

    //     currentIndex = potentialTagEnd + 1;
    //   } else if (this.couldBeIncompleteMatch(potentialTag)) {
    //     this.buffer = this.buffer.slice(currentIndex);
    //     return result;
    //   } else {
    //     result.push({
    //       type: "text",
    //       text: potentialTag,
    //     });
    //     currentIndex = potentialTagEnd + 1;
    //   }
    // }
    // potentialTagStart = this.buffer.indexOf("<", currentIndex);
    // }
    // // Add remaining text if any
    // if (currentIndex < this.buffer.length) {
    //   result.push({
    //     type: "text",
    //     text: this.buffer.slice(currentIndex),
    //   });
    //   this.buffer = "";
    // } else if (currentIndex === this.buffer.length) {
    //   this.buffer = "";
    // }
    // return result;
  }

  // private couldBeIncompleteMatch(partial: string): boolean {
  //   return [...this.tagPatterns, ...this.closingTagPatterns].some((pattern) => {
  //     const patternStr = pattern.source;
  //     const partialPattern = new RegExp(
  //       "^" + partial.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  //     );
  //     return partialPattern.test(patternStr);
  //   });
  // }

  flush(): string | null {
    if (this.buffer.length === 0) {
      return null;
    }
    const result = this.buffer;
    this.buffer = "";
    return result;
  }
}

const testProcessor = new StreamingTagProcessor(["SHINY", "SHINYAPP", "FILE"]);

function testTagMatches() {
  console.log("Testing tag matches:");
  const testStrings = [
    "<",
    "<S",
    "<SH",
    "<SHINY",
    "<SHINY ",
    "<SHINY>",
    "<SHINY >",
    "<SHINY FO",
    "<SHINYA",
    "</SHINYA",
    "<SHINYAPP",
    "<SHINYAPP>",
    "<SHINYAPP >",
    "</SHINYAPP>",
    "</SHINYAPP >",
    "<SHINYAPP ",
    "<SHINYAPP FOO",
    "<SHINYAPP FOO ",
    "<SHINYAPP FOO=",
    "<SHINYAPP FOO= ",
    "<SHINYAPP FOO =",
    "<SHINYAPP FOO = ",
    '<SHINYAPP FOO = "1"',
    "<SHINYAPP FOO='1'",
    "<SHINYAPP FOO='1'>",
    `<SHINYAPP FOO="1" >`,
    `<SHINYAPP FOO= "1" BAR ='2'`,
    `<SHINYAPP FOO= "1" BAR ='2'>`,
    ">",
    "<>",
    "</ ",
    "<-",
    "< ",
    "<XH",
    "<SHIP",
    "<SHINYX",
    "<SHINYAPPX",
    "<SHINYAPPX>",
    "<SHINYAPP =",
    "<SHINYAPP -",
    "<SHINYAPP FOO=1",
    "<SHINYAPP FOO>",
    "<SHINYAPP FOO=>",
    `<SHINYAPP FOO=">`,
    "<SHINYAPP FOO=1",
    "<SHINYAPP FOO = 1 ",
  ];

  for (const s of testStrings) {
    console.log(
      `Testing tag match for tag name: ${s}: ${testProcessor.isPotentialTag(s)}`
    );
  }
}
testTagMatches();
