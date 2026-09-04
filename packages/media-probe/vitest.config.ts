import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    // The parse layer falls back to the machine's zone when no zone is given,
    // so the tests pin one. Without this the frozen corpus in
    // `test/fixtures/parse-corpus.json` would only match on a Brussels laptop.
    env: {TZ: 'Europe/Brussels'},
  },
})
