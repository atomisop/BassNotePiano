export default {
  plugins: {
    // Tailwind v4: `tailwindcss` is no longer a PostCSS plugin itself,
    // the engine moved into `@tailwindcss/postcss`. Autoprefixer is gone
    // too; v4 handles vendor prefixing internally, and keeping the old
    // plugin alongside it would just double-prefix for no benefit.
    "@tailwindcss/postcss": {},
  },
};
