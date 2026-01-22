import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import fs from 'fs';
import path from "path"
import { componentTagger } from "lovable-tagger"

// Custom plugin to copy index.html as 404.html for Vercel SPA routing
function vercelSPAPlugin() {
  return {
    name: 'vercel-spa-plugin',
    closeBundle() {
      // This will run after build
      const distPath = path.resolve(__dirname, 'dist');
      const indexPath = path.join(distPath, 'index.html');
      const notFoundPath = path.join(distPath, '404.html');

      if (fs.existsSync(indexPath)) {
        fs.copyFileSync(indexPath, notFoundPath);
        console.log('✓ Created 404.html for Vercel SPA routing');
      }
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 4550,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
    vercelSPAPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}))
