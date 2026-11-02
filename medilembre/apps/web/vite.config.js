import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      // front chama /api/x -> Fastify recebe /x (o Fastify não tem prefixo /api)
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  // Sem build.rollupOptions.input: o SvelteKit gere as entradas. Os antigos index.html
  // de cliente/farmacia/admin (React) partiam o build; o painel da farmácia e o admin
  // passam a ser grupos de rotas deste mesmo projeto.
});
