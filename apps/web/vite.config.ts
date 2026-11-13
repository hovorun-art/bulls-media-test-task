import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the service runs on :3000 and the page calls it through this proxy.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': process.env.API_URL ?? 'http://127.0.0.1:3000' } },
});
