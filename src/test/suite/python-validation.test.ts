import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { validateWithPython } from "../../diagnostics/python";

suite("Python validation transport", () => {
  let directory: string;
  let script: string;
  setup(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "shiny-transport-"));
    script = path.join(directory, "report.cjs");
  });
  teardown(() => fs.rmSync(directory, { recursive: true, force: true }));

  test("Transports unsaved Unicode source and accepts arbitrary CLI rule codes", async () => {
    fs.writeFileSync(
      script,
      `let input = ''; process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => { const request = JSON.parse(input);
console.log(JSON.stringify({available:true, entry:request.path, files:[request.path], diagnostics:[{
file:request.path, line:2, code:'LIBRARY_RULE', message:request.sources[request.path], severity:'warning', sourceLine:'    café()'}]})); });`
    );
    const file = path.join(directory, "app.py");
    const report = await validateWithPython(process.execPath, script, {
      path: file,
      sources: { [file]: 'print("café")\n' },
    });
    assert.strictEqual(report?.diagnostics[0].message, 'print("café")\n');
    assert.strictEqual(report?.diagnostics[0].code, "LIBRARY_RULE");
  });

  test("An old environment requests the limited fallback", async () => {
    fs.writeFileSync(script, "console.log(JSON.stringify({available:false}));");
    assert.strictEqual(
      await validateWithPython(process.execPath, script, {
        path: path.join(directory, "app.py"),
        sources: {},
      }),
      undefined
    );
  });

  test("An unavailable interpreter reports its launch failure", async () => {
    await assert.rejects(
      validateWithPython(path.join(directory, "missing-python"), script, {
        path: path.join(directory, "app.py"),
        sources: {},
      }),
      /ENOENT/
    );
  });

  test("Malformed reports fail instead of appearing clean", async () => {
    fs.writeFileSync(
      script,
      'console.log(JSON.stringify({available:true,entry:"relative.py",files:[],diagnostics:[]}));'
    );
    await assert.rejects(
      validateWithPython(process.execPath, script, {
        path: path.join(directory, "app.py"),
        sources: {},
      }),
      /Invalid validation report/
    );
  });

  test("Aborting an obsolete scan terminates its process", async () => {
    fs.writeFileSync(script, "setTimeout(() => {}, 30000);");
    const controller = new AbortController();
    const validation = validateWithPython(
      process.execPath,
      script,
      {
        path: path.join(directory, "app.py"),
        sources: {},
      },
      controller.signal
    );
    controller.abort(new Error("Superseded"));
    await assert.rejects(validation, /Superseded/);
  });
});
