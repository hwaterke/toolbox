import type {Finding, TaskFile} from '../load.ts'

/** A file to scan for task ids, minus the lines another rule owns. */
export type Source = {file: string; text: string; skip?: ReadonlySet<number>}

const MENTION = /\b(task|draft)-(\d+)\b/gi

/**
 * Every task id mentioned in `sources` names a task. Any case counts: a
 * `task-41` in a path or a branch name is no mistake.
 */
export function referenceProblems(
  sources: Source[],
  ids: ReadonlySet<string>
): Finding[] {
  const findings: Finding[] = []
  for (const {file, text, skip} of sources) {
    for (const [index, content] of text.split(/\r?\n/).entries()) {
      const line = index + 1
      if (skip?.has(line)) continue
      const seen = new Set<string>()
      for (const [mention, prefix, number] of content.matchAll(MENTION)) {
        if (seen.has(mention)) continue
        seen.add(mention)
        const message =
          prefix?.toLowerCase() === 'draft'
            ? `${mention} is a draft id; drafts are now tasks with status idea`
            : ids.has(`TASK-${number}`)
              ? undefined
              : `${mention} does not exist`
        if (message) findings.push({file, line, message})
      }
    }
  }
  return findings
}

/** A task file as a source. Its `depends` lines belong to the graph rules. */
export function taskSource({file, text, bodyLine}: TaskFile): Source {
  const skip = new Set<number>()
  let inDepends = false
  // Frontmatter lines run from 2 to the line before the closing `---`.
  for (const [index, content] of text.split(/\r?\n/).entries()) {
    const line = index + 1
    if (line < 2 || line > bodyLine - 2) continue
    if (/^depends\s*:/.test(content)) inDepends = true
    else if (/^\S/.test(content)) inDepends = false
    if (inDepends) skip.add(line)
  }
  return {file, text, skip}
}
