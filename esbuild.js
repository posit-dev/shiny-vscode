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
    let entryPoints = build.initialOptions.entryPoints;
    if (!Array.isArray(entryPoints)) {
      entryPoints = [entryPoints];
    }

    build.onStart(() => {
      console.log(
        `[${watch ? "watch " : ""}${new Date().toISOString()}] build ${entryPoints.join(
          ", "
        )}`
      );
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
    build.onEnd((result) => {
      if (result.metafile) {
        // For each output in the metafile
        Object.entries(result.metafile.outputs).forEach(
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          ([outputPath, output]) => {
            // Get the entry point for this output
            const entryPoint = output.entryPoint;
            if (entryPoint) {
              // Extract filename without extension
              const bundleName = entryPoint
                .replace(/^.*[\\/]/, "")
                .replace(/\.[^/.]+$/, "");

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
      entryPoints: ["src/extension.ts"],
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
    test: esbuild.context({
      entryPoints: ["src/test/**/*.ts"],
      bundle: true,
      outdir: "out/test/",
      format: "cjs",
      minify: false,
      sourcemap: false,
      sourcesContent: false,
      platform: "node",
      external: ["vscode"],
      logLevel: "silent",
      metafile: false,
      plugins: [esbuildProblemMatcherPlugin],
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
      .catch((e) => {
        console.error(e);
        process.exit(1);
      })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
