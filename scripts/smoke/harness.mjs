// A tiny runner: each check is a list of named steps; a step passes when it does not throw.
export function makeSuite(title) {
  const steps = [];
  return {
    title,
    step(name, fn) {
      steps.push({ name, fn });
    },
    async run(ctx) {
      const results = [];
      for (const { name, fn } of steps) {
        const started = Date.now();
        try {
          await fn(ctx);
          results.push({ suite: title, name, ok: true, ms: Date.now() - started });
        } catch (err) {
          results.push({ suite: title, name, ok: false, ms: Date.now() - started, detail: String(err?.message ?? err).split("\n")[0].slice(0, 300) });
        }
      }
      return results;
    },
  };
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function env(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") throw new Error(`Set ${name}.`);
  return v;
}
