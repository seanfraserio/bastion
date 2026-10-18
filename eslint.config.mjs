import js from "@eslint/js";
import ts from "@typescript-eslint/eslint-plugin";
import parser from "@typescript-eslint/parser";
import globals from "globals";

export default [
  { ignores: ["**/dist/**", "**/node_modules/**"] },
  {
    files: ["packages/*/src/**/*.ts"],
    languageOptions: { parser, globals: { ...globals.node, ...globals.es2022 } },
    plugins: { "@typescript-eslint": ts },
    rules: {
      ...js.configs.recommended.rules,
      ...ts.configs["eslint-recommended"].overrides[0].rules,
      ...ts.configs.recommended.rules,
      // Preserve the pre-upgrade policy; changing error causes is out of scope.
      "preserve-caught-error": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
];
