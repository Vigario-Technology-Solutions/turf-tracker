import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import nextVitals from "eslint-config-next/core-web-vitals";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    files: ["src/**/*.{ts,tsx,js,jsx}", "emails/**/*.{ts,tsx,js,jsx}"],
    extends: [...nextVitals],
  },

  prettier,

  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "bin/**",
    "generated/**",
    "next-env.d.ts",
    ".commitlintrc.js",
    "eslint.config.js",
    "postcss.config.js",
    "prisma.config.ts",
    "scripts/**",
    "public/sw.js",
    "public/workbox-*.js",
    // server.js is the build:server output at the repo root (gitignored).
    // Lint server.ts instead; the .js is a build artifact.
    "server.js",
  ]),
]);

export default eslintConfig;
