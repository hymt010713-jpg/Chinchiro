import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 開発中は /ws をゲームサーバーへ回す（npm run dev:server で起動）
    proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } },
  },
});
