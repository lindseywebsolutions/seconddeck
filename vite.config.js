import { defineConfig } from 'vite';

export default defineConfig({
  // Relative assets work both on the public origin and in the APK's native
  // secondary-display WebView.
  base: './'
});
