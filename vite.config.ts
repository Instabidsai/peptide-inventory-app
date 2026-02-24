import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import fs from 'fs';
import path from "path"
import { fileURLToPath } from "url"
import checker from 'vite-plugin-checker';

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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
    proxy: {
      '/functions/v1': {
        target: 'https://mckkegmkpqdicudnfhor.supabase.co',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  plugins: [
    react(),
    mode === 'development' &&
    checker({
      overlay: { initialIsOpen: false, badgeStyle: 'position: fixed; bottom: 12px; left: 12px; z-index: 99999;' },
      typescript: true,
      eslint: { lintCommand: 'eslint src/', useFlatConfig: true }
    }),
    vercelSPAPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  esbuild: {
    drop: mode === 'production' ? ['debugger'] : [],
    pure: mode === 'production' ? ['console.log', 'console.debug'] : [],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-select', '@radix-ui/react-tabs', '@radix-ui/react-dropdown-menu', '@radix-ui/react-popover', '@radix-ui/react-tooltip', '@radix-ui/react-alert-dialog'],
          'vendor-charts': ['recharts'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-utils': ['date-fns', 'clsx', 'tailwind-merge', 'zod'],
          'vendor-sentry': ['@sentry/react'],
        },
      },
    },
  },
}))
