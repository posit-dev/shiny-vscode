import * as assert from "assert";
import { StreamingTagProcessor } from "../../assistant/streaming-tag-processor";

suite("StreamingTagProcessor Test Suite", () => {
  test("Tag matching tests", () => {
    const testProcessor = new StreamingTagProcessor([
      "SHINY",
      "FILESET",
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
      { input: "<FILESET", expected: true },
      { input: "<FILESET>", expected: true },
      { input: "<FILESET >", expected: true },
      { input: "</FILESET>", expected: true },
      { input: "</FILESET >", expected: true },
      { input: "<FILESET ", expected: true },
      { input: "<FILESET FOO", expected: true },
      { input: "<FILESET FOO ", expected: true },
      { input: "<FILESET FOO=", expected: true },
      { input: "<FILESET FOO= ", expected: true },
      { input: "<FILESET FOO =", expected: true },
      { input: "<FILESET FOO = ", expected: true },
      { input: '<FILESET FOO = "1"', expected: true },
      { input: "<FILESET FOO='1'", expected: true },
      { input: "<FILESET FOO='1'>", expected: true },
      { input: '<FILESET FOO="1" >', expected: true },
      { input: "<FILESET FOO= \"1\" BAR ='2'", expected: true },
      { input: "<FILESET FOO= \"1\" BAR ='2'>", expected: true },
      { input: ">", expected: false },
      { input: "<>", expected: false },
      { input: "</ ", expected: false },
      { input: "<-", expected: false },
      { input: "< ", expected: false },
      { input: "<XH", expected: false },
      { input: "<SHIP", expected: false },
      { input: "<SHINYX", expected: false },
      { input: "<FILESETX", expected: false },
      { input: "<FILESETX>", expected: false },
      { input: "<FILESET =", expected: false },
      { input: "<FILESET -", expected: false },
      { input: `<FILESET FOO>`, expected: false },
      { input: `<FILESET FOO >`, expected: false },
      { input: `<FILESET FOO=>`, expected: false },
      { input: `<FILESET FOO=">`, expected: false },
      { input: "<FILESET FOO=1", expected: false },
      { input: "<FILESET FOO = 1 ", expected: true },
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
