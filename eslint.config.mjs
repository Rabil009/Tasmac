import eslint from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([".next/**", "next-env.d.ts", "desktop-dist/**", "release/**"]),
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  nextPlugin.configs.recommended,
]);
