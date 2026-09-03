// mocha 10 exported the Mocha class as `module.exports` itself; mocha 12
// exports an ESM-style namespace with the class on `.Mocha`/`.default`.
// `import =` so esbuild emits a plain require, and a cast because @types/mocha
// still declares the old `export =` shape.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import MochaModule = require("mocha");

type MochaCtor = typeof MochaModule;

const namespace = MochaModule as unknown as Record<string, MochaCtor>;

export const mochaCtor: MochaCtor =
  typeof MochaModule === "function"
    ? MochaModule
    : (namespace["Mocha"] ?? namespace["default"]);
