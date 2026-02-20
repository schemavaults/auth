// @schemavaults/auth-server-sdk - eslint.config.cjs

const js = require("@eslint/js");
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const globals = require("globals");

module.exports = [
  // Base recommended configs
  js.configs.recommended,

  // Main config
  {
    files: ["src/**/*.{ts,tsx,js,jsx}"],

    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: false,
        },
        project: "./tsconfig.json",
      },
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.node,
        __SDK_VERSION__: "readonly",
      },
    },

    plugins: {
      "@typescript-eslint": tsPlugin,
    },

    rules: {
      // TypeScript recommended rules
      ...tsPlugin.configs.recommended.rules,

      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // Ignore patterns
  {
    ignores: ["dist/**", "node_modules/**", "*.config.js", "*.config.cjs"],
  },
];
