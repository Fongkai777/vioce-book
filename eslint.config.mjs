import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "dist/**",
    "vendor/**",
    "public/pdf.worker.min.mjs", // Generated verbatim from the locked PDF.js package.
    ".sites-runtime/**",
    ".wrangler/**",
    "outputs/**", // Ignored local evaluation artifacts, never release source.
  ]),
  {
    files: ["app/page.tsx"],
    rules: {
      // This non-Compiler component coordinates mutable AudioContext/turn/history
      // handles returned by hooks. UI reads are paired with React state updates.
      // Compiler alias analysis treats those intentional handles as immutable.
      // See docs/LINT.md; do not extend this exception to new components.
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
    },
  },
  {
    files: ["app/admin/feedback-list.tsx", "app/admin/operations-panel.tsx", "app/book-manager.tsx", "app/login/page.tsx", "app/pdf-preview.tsx", "app/sample-library.tsx", "app/voice-session.tsx", "hooks/use-local-library.ts"],
    rules: {
      // These effects reset loading/selection/waveform state when external
      // resources change. Keep their cancellation guards and exhaustive deps;
      // don't defer setters just to make the rule stop detecting them.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
