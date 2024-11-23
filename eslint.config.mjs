import eslint from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import globals from "globals";
import tseslint from "typescript-eslint";

const commonRules = {
  "@typescript-eslint/naming-convention": "warn",
  curly: ["warn", "multi-line"],
  eqeqeq: "warn",
  "no-throw-literal": "warn",
  semi: "warn",
  "@typescript-eslint/no-unused-vars": "off",
  "@typescript-eslint/consistent-type-imports": "warn",
  "@typescript-eslint/no-floating-promises": "error",
};

const commonTsConfig = {
  parser: tsParser,
  ecmaVersion: 2022,
  sourceType: "module",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    project: "./tsconfig.json",
    ecmaFeatures: {
      jsx: true,
    },
  },
};

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["out", "**/*.d.ts"],
  },
  {
    // Build scripts config - these are run by nodejs, and use commonjs syntax.
    files: ["esbuild.js", "**/tailwind.config.js"],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // Node.js TypeScript files (src/)
    files: ["src/**/*.ts"],
    languageOptions: {
      ...commonTsConfig,
      globals: globals.node,
    },
    rules: commonRules,
  }
);
