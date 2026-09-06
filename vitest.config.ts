import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const fixture = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@deepseek-ai/dsh-client-ui-chat/client': fixture('./harness/packages/client/ui-chat/src/client/open-workspace-file.ts'),
      '@deepseek-ai/dsh-session-persistence': fixture('./harness/packages/session/session-persistence/src/errors.ts'),
    },
  },
})
