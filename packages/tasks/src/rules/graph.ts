import type {Finding, TaskFile} from '../load.ts'
import {isOpen} from '../schema.ts'

/** Problems in the `depends` links between tasks. */
export function graphProblems(tasks: TaskFile[]): Finding[] {
  const byId = new Map(
    tasks.flatMap((task) => (task.id ? [[task.id, task]] : []))
  )
  const findings: Finding[] = []

  for (const task of tasks) {
    const {id, frontmatter} = task
    if (!id || !frontmatter) continue
    for (const [index, dependency] of (frontmatter.depends ?? []).entries()) {
      const at = (message: string) =>
        findings.push({
          file: task.file,
          line: task.dependsLines[index] ?? 1,
          message,
        })
      const target = byId.get(dependency)
      if (dependency === id) {
        at('depends on itself')
      } else if (!target) {
        at(`depends on ${dependency}, which does not exist`)
      } else if (target.frontmatter) {
        const status = target.frontmatter.status
        if (frontmatter.status === 'done' && isOpen(status)) {
          at(`done, but depends on ${dependency}, which is ${status}`)
        } else if (isOpen(frontmatter.status) && status === 'dropped') {
          at(`depends on ${dependency}, which is dropped`)
        }
      }
    }
  }

  findings.push(...cycles(tasks, byId))
  return findings
}

/**
 * One finding per back edge of a depth-first walk, at the `depends` entry that
 * closes the cycle. Self-dependencies have their own rule and are skipped.
 */
function cycles(tasks: TaskFile[], byId: Map<string, TaskFile>): Finding[] {
  const findings: Finding[] = []
  const done = new Set<string>()
  const stack: string[] = []

  const visit = (task: TaskFile) => {
    const id = task.id as string
    stack.push(id)
    for (const [index, dependency] of (
      task.frontmatter?.depends ?? []
    ).entries()) {
      if (dependency === id || done.has(dependency)) continue
      const start = stack.indexOf(dependency)
      if (start !== -1) {
        const cycle = [...stack.slice(start), dependency].join(' -> ')
        findings.push({
          file: task.file,
          line: task.dependsLines[index] ?? 1,
          message: `dependency cycle ${cycle}`,
        })
        continue
      }
      const target = byId.get(dependency)
      if (target) visit(target)
    }
    stack.pop()
    done.add(id)
  }

  for (const task of tasks) {
    if (task.id && !done.has(task.id)) visit(task)
  }
  return findings
}
