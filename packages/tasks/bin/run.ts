#!/usr/bin/env node

import {main} from '../src/cli.ts'

// A reader that stops early, as under `| head`, closes the pipe: the rest of
// the output has nowhere to go and is not an error.
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') return
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})

// `||=`: a write error can land before main returns, and must not be reset to 0.
process.exitCode ||= await main(process.argv.slice(2))
