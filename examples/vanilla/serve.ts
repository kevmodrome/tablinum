import { $ } from "bun";

const dir = "examples/vanilla";

// Bundle app.ts for the browser
console.log("Bundling...");
const result = await Bun.build({
  entrypoints: [`${dir}/app.ts`],
  outdir: dir,
  target: "browser",
  format: "esm",
  minify: false,
  sourcemap: "inline",
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log(`Bundle created at ${dir}/app.js`);

// Serve
const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;
    if (path === "/") path = "/index.html";

    const file = Bun.file(`${dir}${path}`);
    if (await file.exists()) {
      return new Response(file);
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Demo running at http://localhost:${server.port}`);
