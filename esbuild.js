const esbuild = require("esbuild");
const fs = require("fs");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");
const metafile = process.argv.includes("--metafile");

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",

  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`
        );
      });
      console.log("[watch] build finished");
    });
  },
};

const metafilePlugin = {
  name: "metafile",
  setup(build) {
    // const outfile = build.initialOptions.outfile;
    // const entryPoints = build.initialOptions.entryPoints;

    build.onEnd((result) => {
      if (result.metafile) {
        // For each output in the metafile
        Object.entries(result.metafile.outputs).forEach(
          ([outputPath, output]) => {
            // Get the entry point for this output
            const entryPoint = output.entryPoint;
            if (entryPoint) {
              // Extract filename without extension
              const bundleName = entryPoint
                .replace(/^.*[\\/]/, "")
                .replace(/\.[^/.]+$/, "");
              console.log(`meta.${bundleName}.json`);

              fs.writeFileSync(
                `${bundleName}.esbuild-meta.json`,
                JSON.stringify(result.metafile)
              );
            }
          }
        );
      }
    });
  },
};

async function main() {
  const buildmap = {
    extension: esbuild.context({
      entryPoints: ["src/extension.ts", "src/test/runTest.ts"],
      bundle: true,
      outdir: "out/",
      format: "cjs",
      minify: production,
      sourcemap: !production,
      sourcesContent: false,
      platform: "node",
      external: ["vscode"],
      logLevel: "silent",
      metafile: metafile,
      plugins: [metafilePlugin, esbuildProblemMatcherPlugin],
    }),
  };

  Object.values(buildmap).forEach((build) =>
    build
      .then(async (context) => {
        if (watch) {
          await context.watch();
        } else {
          await context.rebuild();
          await context.dispose();
        }
      })
      .catch(() => process.exit(1))
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
