import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      // Proxy /api to Laravel backend in development
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  // In production builds, VITE_API_URL defaults to /api (same-origin, Hostinger subfolder)
  define: mode === 'production' ? {} : {},
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Optimize bundle size and loading
    target: 'esnext',
    minify: 'terser',
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching and parallel loading
        manualChunks: (id) => {
          // Core React libraries - keep small
          if (id.includes('node_modules/react/') && !id.includes('react-dom')) {
            return 'react-core';
          }
          if (id.includes('node_modules/react-dom')) {
            return 'react-dom';
          }
          if (id.includes('node_modules/react-router')) {
            return 'react-router';
          }
          // Radix UI components - split by component
          if (id.includes('node_modules/@radix-ui/react-dialog')) {
            return 'ui-dialog';
          }
          if (id.includes('node_modules/@radix-ui')) {
            return 'ui-vendor';
          }
          // TanStack Query
          if (id.includes('node_modules/@tanstack')) {
            return 'query-vendor';
          }
          // Lucide icons - separate for lazy loading
          if (id.includes('node_modules/lucide-react')) {
            return 'icons';
          }
          // Date utilities
          if (id.includes('node_modules/date-fns')) {
            return 'date-utils';
          }
          // Sonner toast
          if (id.includes('node_modules/sonner')) {
            return 'toast';
          }
          // Other large dependencies
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
        // Optimize chunk file names
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
      },
    },
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 1000,
    // Enable CSS code splitting
    cssCodeSplit: true,
    // Optimize source maps for production
    sourcemap: false,
    // Report compressed size
    reportCompressedSize: false,
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
    exclude: ['@lovable-dev/tagger'],
  },
}));
