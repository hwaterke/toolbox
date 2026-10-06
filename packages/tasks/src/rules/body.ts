import type {Finding, TaskFile} from '../load.ts'

const CRITERIA = /^## Acceptance criteria\s*$/
const SECTION = /^## /
const UNTICKED = /^\s*[-*] \[ \]/
const BLANK_OR_HEADING = /^\s*(#.*)?$/

/** Problems in a task's body that its status makes wrong. */
export function bodyProblems(tasks: TaskFile[]): Finding[] {
  const findings: Finding[] = []
  for (const {file, frontmatter, body, bodyLine} of tasks) {
    const lines = body.split('\n')
    if (frontmatter?.status === 'done') {
      let inCriteria = false
      for (const [index, line] of lines.entries()) {
        if (SECTION.test(line)) inCriteria = CRITERIA.test(line)
        else if (inCriteria && UNTICKED.test(line)) {
          findings.push({
            file,
            line: bodyLine + index,
            message: 'done, but this criterion is not ticked',
          })
        }
      }
    }
    if (
      frontmatter?.status === 'dropped' &&
      lines.every((line) => BLANK_OR_HEADING.test(line))
    ) {
      findings.push({
        file,
        line: bodyLine,
        message: 'dropped, but no line in the body says why',
      })
    }
  }
  return findings
}
