// Next.js 16 removed the built-in `next lint` command in favor of running
// ESLint directly, which also means the old .eslintrc.json format (ESLint
// 8-style) had to go — ESLint 9+ only auto-detects flat config. This is the
// direct flat-config equivalent of the old `{ "extends": "next/core-web-vitals" }`.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [".next/**", ".netlify/**", "node_modules/**"],
  },
  ...nextCoreWebVitals,
  {
    // This version of eslint-config-next bundles the React Compiler's
    // static-analysis rules by default, on every project regardless of
    // whether that project has actually opted into the compiler (this one
    // hasn't — no `experimental.reactCompiler` in next.config.ts). They're
    // compiler-readiness advisories, not correctness rules: every flagged
    // pattern here (e.g. `useEffect(() => setMounted(true), [])` to read a
    // client-only value once after mount) is a normal, safe, working React
    // pattern today. Turned off so this Next/React/Prisma upgrade doesn't
    // silently bundle in a large, unrelated "make the whole codebase
    // React-Compiler-ready" refactor. Revisit this block explicitly if this
    // project ever turns the compiler on.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "react-hooks/incompatible-library": "off",
    },
  },
];

export default config;
