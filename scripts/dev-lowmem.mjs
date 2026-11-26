#!/usr/bin/env node
// `npm run dev:lowmem`: next dev for a laptop shared with other heavy apps or several dev chats.
// - NEXT_DEV_LOW_MEM=1: next.config.ts runs the React Compiler only on "use memo" files in dev. Its Babel helper
//   processes otherwise add ~1.4 GB at the first compile. Production builds always use the full compiler.
// - A 3 GB heap. Next restarts its dev server once a request finds the heap past 80% of the limit; without a limit
//   it takes half the machine's RAM.
// - --disable-source-maps: Node's source-map caches otherwise keep 300-400 MB in the server.
// Extra arguments pass through, e.g. `npm run dev:lowmem -- -p 3001`. A launcher, not inline env syntax, so it
// also works from Windows cmd.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const heap = "--max-old-space-size=3072";
const nodeOptions = [process.env.NODE_OPTIONS, heap].filter(Boolean).join(" ");

const child = spawn(process.execPath, [nextBin, "dev", "--disable-source-maps", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, NEXT_DEV_LOW_MEM: "1", NODE_OPTIONS: nodeOptions },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
