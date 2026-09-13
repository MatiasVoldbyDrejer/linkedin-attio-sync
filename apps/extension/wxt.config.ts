import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'wxt'

// Builds for teammates must point at your deployed backend via WXT_BACKEND_URL. The web app's
// build sets it for the /install download; a plain local build targets `next dev`.
const backendUrl = (process.env.WXT_BACKEND_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
const backend = new URL(backendUrl)

/** `1.5rem` in declarations, but not inside escaped arbitrary-value class names like `\[1rem\]`, `\[-2rem\]` or `\.5rem` */
const REM = /(?<![\w\\.[-])(-?\d*\.?\d+)rem\b/g

export default defineConfig({
  // macOS file pickers hide dot-folders, which makes WXT's default .output hard to "Load unpacked"
  outDir: 'dist',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    define: { 'import.meta.env.WXT_BACKEND_URL': JSON.stringify(backendUrl) },
    plugins: [
      tailwindcss(),
      {
        // rem inside the content script's shadow root scales with linkedin.com's own html font-size
        name: 'content-script-rem-to-px',
        enforce: 'post',
        generateBundle(_, bundle) {
          for (const file of Object.values(bundle)) {
            if (file.type !== 'asset' || !/^content-scripts\/.+\.css$/.test(file.fileName)) continue
            file.source = String(file.source).replace(REM, (_, value: string) => `${Number((Number(value) * 16).toFixed(3))}px`)
          }
        },
      },
    ],
  }),
  manifest: {
    name: 'LinkedIn → Attio Sync',
    description: 'Syncs your LinkedIn conversations to people in Attio.',
    // no popup: clicking the toolbar button opens the side panel (see background.ts)
    action: { default_title: 'LinkedIn → Attio Sync' },
    permissions: ['storage', 'alarms', 'cookies', 'scripting', 'tabs', 'identity'],
    // the built-in backend needs no runtime permission prompt (match patterns can't carry ports)
    host_permissions: ['https://www.linkedin.com/*', `${backend.protocol}//${backend.hostname}/*`],
    // a developer override of the backend URL is granted at runtime from the options page
    optional_host_permissions: ['https://*/*', 'http://localhost/*'],
  },
})
