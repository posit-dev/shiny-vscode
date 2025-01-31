import * as assert from "assert";
import { StreamingTagProcessor } from "../../assistant/streaming-tag-processor";

suite("StreamingTagProcessor Test Suite", () => {
  test("Tag matching tests", () => {
    const testProcessor = new StreamingTagProcessor([
      "SHINY",
      "SHINYAPP",
      "FILE",
    ]);

    const testCases = [
      { input: "<", expected: false },
      { input: "<S", expected: false },
      { input: "<SH", expected: false },
      { input: "<SHINY", expected: true },
      { input: "<SHINY ", expected: true },
      { input: "<SHINY>", expected: true },
      { input: "<SHINY >", expected: true },
      { input: "<SHINY FO", expected: true },
      { input: "<SHINYA", expected: false },
      { input: "</SHINYA", expected: false },
      { input: "<SHINYAPP", expected: true },
      { input: "<SHINYAPP>", expected: true },
      { input: "<SHINYAPP >", expected: true },
      { input: "</SHINYAPP>", expected: true },
      { input: "</SHINYAPP >", expected: true },
      { input: "<SHINYAPP ", expected: true },
      { input: "<SHINYAPP FOO", expected: true },
      { input: "<SHINYAPP FOO ", expected: true },
      { input: "<SHINYAPP FOO=", expected: true },
      { input: "<SHINYAPP FOO= ", expected: true },
      { input: "<SHINYAPP FOO =", expected: true },
      { input: "<SHINYAPP FOO = ", expected: true },
      { input: '<SHINYAPP FOO = "1"', expected: true },
      { input: "<SHINYAPP FOO='1'", expected: true },
      { input: "<SHINYAPP FOO='1'>", expected: true },
      { input: '<SHINYAPP FOO="1" >', expected: true },
      { input: "<SHINYAPP FOO= \"1\" BAR ='2'", expected: true },
      { input: "<SHINYAPP FOO= \"1\" BAR ='2'>", expected: true },
      { input: ">", expected: false },
      { input: "<>", expected: false },
      { input: "</ ", expected: false },
      { input: "<-", expected: false },
      { input: "< ", expected: false },
      { input: "<XH", expected: false },
      { input: "<SHIP", expected: false },
      { input: "<SHINYX", expected: false },
      { input: "<SHINYAPPX", expected: false },
      { input: "<SHINYAPPX>", expected: false },
      { input: "<SHINYAPP =", expected: false },
      { input: "<SHINYAPP -", expected: false },
      { input: `<SHINYAPP FOO>`, expected: false },
      { input: `<SHINYAPP FOO >`, expected: false },
      { input: `<SHINYAPP FOO=>`, expected: false },
      { input: `<SHINYAPP FOO=">`, expected: false },
      { input: "<SHINYAPP FOO=1", expected: false },
      { input: "<SHINYAPP FOO = 1 ", expected: true },
    ];

    for (const testCase of testCases) {
      assert.strictEqual(
        testProcessor.process(testCase.input),
        testCase.expected,
        `Failed on input: "${testCase.input}"`
      );
    }
  });
});
