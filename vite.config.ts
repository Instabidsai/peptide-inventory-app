import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import fs from 'fs';
import path from "path"
import { fileURLToPath } from "url"
import checker from 'vite-plugin-checker';

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// import { componentTagger } from "lovable-tagger"

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
    host: "0.0.0.0",
    port: 4550,
    strictPort: true,
  },
  plugins: [
    react(),
    mode === 'development' &&
    // componentTagger(),
    checker({
      typescript: true,
      eslint: { lintCommand: 'eslint . --max-warnings=0', useFlatConfig: true }
    }),
    vercelSPAPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}))
