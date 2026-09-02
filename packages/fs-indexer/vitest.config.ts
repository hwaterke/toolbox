import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    // @oclif/test captures output by patching process.stdout.write, which
    // vitest's console interception bypasses.
    disableConsoleIntercept: true,
    env: {
      // findRoot() walks up from require.main, which under vitest lands
      // outside the package and makes every command "not found".
      OCLIF_TEST_ROOT: fileURLToPath(new URL('.', import.meta.url)),
    },
    testTimeout: 30_000,
  },
})
