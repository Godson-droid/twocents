import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        // mainnet-js imports node's "crypto" for its node code path only;
        // route it to a WebCrypto-backed shim so the browser bundle has no
        // externalized stub on the wallet-generation path.
        find: /^crypto$/,
        replacement: fileURLToPath(
          new URL('./src/lib/node-crypto-shim.ts', import.meta.url),
        ),
      },
    ],
  },
})
