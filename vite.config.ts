import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    // NOTE: no secrets are injected into the client bundle. All Gemini calls
    // go through the server-side proxy (see services/geminiService.ts).
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
});
