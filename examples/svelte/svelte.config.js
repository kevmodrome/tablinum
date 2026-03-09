import adapter from "@sveltejs/adapter-static";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      fallback: "index.html",
    }),
    alias: {
      "localstr/svelte": "../../src/svelte/index.svelte.ts",
      localstr: "../../src/index.ts",
    },
  },
};

export default config;
