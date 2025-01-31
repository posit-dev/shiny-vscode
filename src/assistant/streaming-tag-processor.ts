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

  // Variables for tracking the state of the parser
  private state:
    | "TEXT" // Initial state - we're not in a potential tag
    | "TAG_START" // We've seen "<"
    | "TAG_START_SLASH" // We've seen "</"
    | "TAG_NAME" // We're in a potential tag name, like "<SH" or "</SH"
    | "WHITESPACE" // We're in whitespace after the tag name or betweent attrs
    | "ATTR_NAME" // We're in an attribute name, like "<SHINYAPP F"
    | "ATTR_NAME_END" // Finished attr name with whitespace, like "<SHINYAPP FOO " (doesn't always go into this state)
    | "ATTR_EQUAL_FOUND" // Found = sign after attr name, like "<SHINYAPP FOO="
    | "IN_ATTR_VALUE_DOUBLE_QUOTE" // Found opening double quote for attr value, like `<SHINYAPP FOO="`
    | "IN_ATTR_VALUE_SINGLE_QUOTE" // Found opening single quote for attr value, like `<SHINYAPP FOO='`
    | "ATTRIBUTE_VALUE_END" // Found closing quote for attr value, like `<SHINYAPP FOO="1"`
    | "TAG_END" = "TEXT"; // Found closing angle bracket, like `<SHINYAPP>`

  private scannedText: string = "";

  // Variables for tracking the state when we're in a potential tag
  private tagName: string = "";
  private kind: "open" | "close" = "open";
  private currentAttributeName: string = "";
  private currentAttributeValue: string = "";
  private attributes: Record<string, string> = {};
  // Counter for iterating over a tag name character by character.
  private tagNameIdx = 0;
  private potentialTagNameMatches: string[] = [];

  private resetPotentialTagStateVars() {
    this.tagNameIdx = 0;
    this.potentialTagNameMatches = [...this.tagNames];
    this.tagName = "";
    this.kind = "open";
    this.currentAttributeName = "";
    this.currentAttributeValue = "";
    this.attributes = {};
  }

  /**
   * Creates a new StreamingTagProcessor that looks for specified XML-style tags.
   * @param tagNames - Array of tag names without angle brackets or attributes
   *                  (e.g., ["SHINYAPP", "FILE"])
   */
  constructor(tagNames: string[]) {
    // TODO: Validate tag names
    this.tagNames = [...tagNames];
    this.resetPotentialTagStateVars();
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
    // this.buffer += chunk;

    const result: Array<ProcessedText | ProcessedTag> = [];

    for (const char of chunk) {
      if (this.state === "TEXT") {
        if (char === "<") {
          if (this.scannedText.length > 0) {
            result.push({ type: "text", text: this.scannedText });
            this.scannedText = "";
          }

          this.state = "TAG_START";
        } else {
          // Just more text; don't change state
        }
      } else if (this.state === "TAG_START") {
        if (char === "/") {
          // We have "</"
          this.state = "TAG_START_SLASH";
        } else if (/^[a-zA-Z0-9]$/.test(char)) {
          // This is a valid starting character for a tag name
          // Iterate backward over the list of potentialTagNameMatches because we
          // may remove items as we go.
          for (let j = this.potentialTagNameMatches.length - 1; j >= 0; j--) {
            if (char !== this.potentialTagNameMatches[j][this.tagNameIdx]) {
              // Character mismatch: we can remove this tag name from the list of
              // potential matches.
              this.potentialTagNameMatches.splice(j, 1);
            }
          }

          if (this.potentialTagNameMatches.length === 0) {
            // Didn't match any tag names, as in "<Z"
            this.resetPotentialTagStateVars();
            this.state = "TEXT";
          }

          this.state = "TAG_NAME";
          this.tagName = char;
          this.kind = "open";
          this.tagNameIdx++;
        } else {
          // Not a valid tag name starting character
          this.resetPotentialTagStateVars();
          this.state = "TEXT";
        }
      } else if (this.state === "TAG_START_SLASH") {
        if (/^[a-zA-Z0-9]$/.test(char)) {
          for (let j = this.potentialTagNameMatches.length - 1; j >= 0; j--) {
            if (char !== this.potentialTagNameMatches[j][this.tagNameIdx]) {
              this.potentialTagNameMatches.splice(j, 1);
            }
          }

          if (this.potentialTagNameMatches.length === 0) {
            // Didn't match any tag names, as in "</Z"
            this.resetPotentialTagStateVars();
            this.state = "TEXT";
          }

          this.state = "TAG_NAME";
          this.tagName = char;
          this.kind = "close";
          this.tagNameIdx++;
        } else {
          // Not a valid tag name starting character
          this.resetPotentialTagStateVars();
          this.state = "TEXT";
        }
      } else if (this.state === "TAG_NAME") {
        // This state: We're in a tag name and have at least one character

        if (char === " " || char === ">") {
          // Filter out potentialTagNameMatches that aren't the correct length.
          // So if the potentialTagNameMatches are ["SHINY", "SHINYAPP"], and
          // the text up to here is "<SHINY>", we should remove "SHINYAPP" from
          // the potential matches. (For consistency, we're not using filter();
          // elsewhere in the code we're modifying the array in place.)
          for (let i = this.potentialTagNameMatches.length - 1; i >= 0; i--) {
            if (this.tagNameIdx !== this.potentialTagNameMatches[i].length) {
              this.potentialTagNameMatches.splice(i, 1);
            }
          }
          // If we hit the end of a tag name, we can transition to the next state.
          if (this.potentialTagNameMatches.length === 1) {
            if (char === " ") {
              // "<SHINYAPP "
              this.state = "WHITESPACE";
            } else if (char === ">") {
              // "<SHINYAPP>"
              this.state = "TAG_END";
            } else {
              // Shouldn't get here, throw error
              throw new Error(`Unexpected character: ${char}`);
            }
          } else {
            // If we got here, then it's something like "<SHIN>" or "<SHINYA "
            this.resetPotentialTagStateVars();
            this.state = "TEXT";
          }
        } else if (/^[a-zA-Z0-9_-]$/.test(char)) {
          for (let j = this.potentialTagNameMatches.length - 1; j >= 0; j--) {
            if (char !== this.potentialTagNameMatches[j][this.tagNameIdx]) {
              this.potentialTagNameMatches.splice(j, 1);
            }
          }

          if (this.potentialTagNameMatches.length === 0) {
            // Didn't match any tag names, as in "<SHINYX"
            this.resetPotentialTagStateVars();
            this.state = "TEXT";
          }

          this.tagName += char;
          this.tagNameIdx++;
        } else {
          // Not a valid tag name character, as in "<SHIN!"
          this.resetPotentialTagStateVars();
          this.state = "TEXT";
        }
      } else if (this.state === "WHITESPACE") {
        if (/^[a-zA-Z0-9]$/.test(char)) {
          // TODO: Closing tags shouldn't have attributes
          // Could be the start of an attribute name
          this.state = "ATTR_NAME";
          this.currentAttributeName = char;
        } else if (char === " ") {
          // Stay in this state
        } else if (char === ">") {
          this.state = "TAG_END";
        } else {
          // Invalid character - we're not in a tag
          this.resetPotentialTagStateVars();
          this.state = "TEXT";
        }
      } else if (this.state === "ATTR_NAME") {
        if (/^[a-zA-Z0-9_-]$/.test(char)) {
          // Stay in this state
          this.currentAttributeName += char;
        } else if (char === " ") {
          this.state = "ATTR_NAME_END";
        } else if (char === "=") {
          this.state = "ATTR_EQUAL_FOUND";
        } else {
          // Invalid character
          this.resetPotentialTagStateVars();
          this.state = "TEXT";
        }
      } else if (this.state === "ATTR_NAME_END") {
        if (char === " ") {
          // Stay in this state
        } else if (char === "=") {
          this.state = "ATTR_EQUAL_FOUND";
        } else {
          // Invalid character
          this.resetPotentialTagStateVars();
          this.state = "TEXT";
        }
      } else if (this.state === "ATTR_EQUAL_FOUND") {
        if (char === " ") {
          // Stay in this state
        } else if (char === '"') {
          // Found opening quote - now we're in the attribute value
          this.state = "IN_ATTR_VALUE_DOUBLE_QUOTE";
          this.currentAttributeValue = "";
        } else if (char === "'") {
          this.state = "IN_ATTR_VALUE_SINGLE_QUOTE";
          this.currentAttributeValue = "";
        } else {
          this.resetPotentialTagStateVars();
          this.state = "TEXT";
        }
      } else if (this.state === "IN_ATTR_VALUE_DOUBLE_QUOTE") {
        if (char === '"') {
          // Found closing quote. Save the attribute name-value pair and reset
          // the accumulators.
          this.state = "ATTRIBUTE_VALUE_END";
          this.attributes[this.currentAttributeName] =
            this.currentAttributeValue;
          this.currentAttributeName = "";
          this.currentAttributeValue = "";
        } else if (char === ">") {
          // The attribute value shouldn't have a ">". Those should be escaped.
          this.resetPotentialTagStateVars();
          this.state = "TEXT";
        } else {
          this.currentAttributeValue += char;
        }
      } else if (this.state === "IN_ATTR_VALUE_SINGLE_QUOTE") {
        // This block behaves the same as the double-quote block above.
        if (char === "'") {
          this.state = "ATTRIBUTE_VALUE_END";
          this.attributes[this.currentAttributeName] =
            this.currentAttributeValue;
          this.currentAttributeName = "";
          this.currentAttributeValue = "";
        } else if (char === ">") {
          this.resetPotentialTagStateVars();
          this.state = "TEXT";
        } else {
          this.currentAttributeValue += char;
        }
      } else if (this.state === "ATTRIBUTE_VALUE_END") {
        if (char === " ") {
          this.state = "WHITESPACE";
        } else if (char === ">") {
          this.state = "TAG_END";
        } else {
          this.resetPotentialTagStateVars();
          this.state = "TEXT";
        }
      }

      this.scannedText += char;

      // We found a complete tag! Add it to the result and reset the state.
      if (this.state === "TAG_END") {
        result.push({
          type: "tag",
          name: this.tagName,
          kind: this.kind,
          attributes: structuredClone(this.attributes),
          originalText: this.scannedText,
        });
        this.scannedText = "";
        this.resetPotentialTagStateVars();
        this.state = "TEXT";
      }
    }

    // At the end, if we're in the TEXT state, we can flush the text.
    if (this.state === "TEXT") {
      if (this.scannedText.length > 0) {
        result.push({ type: "text", text: this.scannedText });
        this.scannedText = "";
      }
    }

    return result;
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

// const testProcessor = new StreamingTagProcessor(["SHINY", "SHINYAPP", "FILE"]);

// function testTagMatches() {
//   console.log("Testing tag matches:");
//   const testStrings = [
//     "<",
//     "<S",
//     "<SH",
//     "<SHINY",
//     "<SHINY ",
//     "<SHINY>",
//     "<SHINY >",
//     "<SHINY FO",
//     "<SHINYA",
//     "</SHINYA",
//     "<SHINYAPP",
//     "<SHINYAPP>",
//     "<SHINYAPP >",
//     "</SHINYAPP>",
//     "</SHINYAPP >",
//     "<SHINYAPP ",
//     "<SHINYAPP FOO",
//     "<SHINYAPP FOO ",
//     "<SHINYAPP FOO=",
//     "<SHINYAPP FOO= ",
//     "<SHINYAPP FOO =",
//     "<SHINYAPP FOO = ",
//     '<SHINYAPP FOO = "1"',
//     "<SHINYAPP FOO='1'",
//     "<SHINYAPP FOO='1'>",
//     `<SHINYAPP FOO="1" >`,
//     `<SHINYAPP FOO= "1" BAR ='2'`,
//     `<SHINYAPP FOO= "1" BAR ='2'>`,
//     ">",
//     "<>",
//     "</ ",
//     "<-",
//     "< ",
//     "<XH",
//     "<SHIP",
//     "<SHINYX",
//     "<SHINYAPPX",
//     "<SHINYAPPX>",
//     "<SHINYAPP =",
//     "<SHINYAPP -",
//     "<SHINYAPP FOO=1",
//     "<SHINYAPP FOO>",
//     "<SHINYAPP FOO=>",
//     `<SHINYAPP FOO=">`,
//     "<SHINYAPP FOO=1",
//     "<SHINYAPP FOO = 1 ",
//   ];

//   for (const s of testStrings) {
//     console.log(
//       `Testing tag match for tag name: ${s}: ${testProcessor.process(s)}`
//     );
//   }
// }
// testTagMatches();
