import adapter from "@sveltejs/adapter-static";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      fallback: "index.html",
    }),
    alias: {
      "tablinum/svelte": "../../src/svelte/index.svelte.ts",
      tablinum: "../../src/index.ts",
    },
  },
};

export default config;
