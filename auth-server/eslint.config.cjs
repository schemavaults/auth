const js = require("@eslint/js");
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const globals = require("globals");
const nextVitals = require('eslint-config-next/core-web-vitals')


module.exports = [
  // Base recommended configs
  js.configs.recommended,

  // NextJS Web Vitals recommended rules
  ...nextVitals,

  // Main config
  {
    files: ["src/**/*.{ts,tsx,js,jsx}"],

    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
        project: "./tsconfig.json",
      },
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.node,
      },
    },

    plugins: {
      "@typescript-eslint": tsPlugin,
    },

    settings: {
      react: {
        version: "detect",
      },
    },

    rules: {
      // TypeScript recommended rules
      ...tsPlugin.configs.recommended.rules,

      // Custom overrides
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/jsx-key": [
        "error",
        {
          checkFragmentShorthand: true,
          checkKeyMustBeforeSpread: true,
          warnOnDuplicates: true,
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },

  // Ignore patterns
  {
    ignores: ["dist/**", "node_modules/**", "*.config.js", ".next/**", "out/**", "build/**", "next-env.d.ts"],
  },
];
