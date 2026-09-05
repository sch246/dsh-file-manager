import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const fixture = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@deepseek-ai/dsh-session-persistence': fixture('./harness/packages/session/session-persistence/src/errors.ts'),
      '@dsh-external/dsh-file-manager/remote': fixture('./packages/dsh-file-manager/tests/fixtures/file-manager-remote.ts'),
      '@dsh-external/dsh-file-viewer/client': fixture('../dsh-file-viewer/packages/dsh-file-viewer/src/client/resource.ts'),
    },
  },
})
