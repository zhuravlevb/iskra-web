import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  compilerOptions: {
    // Руны везде — никакого наследия Svelte 4.
    runes: true,
  },
};
