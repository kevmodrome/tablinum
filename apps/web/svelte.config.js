import adapter from "@sveltejs/adapter-static";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  compilerOptions: {
    experimental: {
      async: true,
    },
  },
  kit: {
    adapter: adapter(),
    alias: {
      "tablinum/svelte": "../../packages/tablinum/src/svelte/index.svelte.ts",
      tablinum: "../../packages/tablinum/src/index.ts",
    },
  },
};

export default config;
