import {readdir, readFile} from 'node:fs/promises'
import nodePath from 'node:path'
import {
  isMap,
  isSeq,
  LineCounter,
  parseDocument,
  type Document,
  type Node,
} from 'yaml'
import type {z} from 'zod'
import {Frontmatter} from './schema.ts'

export const TASKS_DIR = 'tasks'

/** One problem in a task file, at a 1-indexed line of that file. */
export type Problem = {line: number; message: string}

/** A task file, valid or not. `file` is relative to the repo root. */
export type TaskFile = {file: string; body: string} & (
  {ok: true; frontmatter: Frontmatter} | {ok: false; problems: Problem[]}
)

/** Reads every `tasks/*.md` under `root`, ordered by number. */
export async function loadTasks(root: string): Promise<TaskFile[]> {
  let names: string[]
  try {
    names = await readdir(nodePath.join(root, TASKS_DIR))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const files = names
    .filter((name) => name.endsWith('.md'))
    .sort((a, b) => a.localeCompare(b, 'en', {numeric: true}))
  return Promise.all(
    files.map(async (name) => {
      const file = `${TASKS_DIR}/${name}`
      return parseTask(file, await readFile(nodePath.join(root, file), 'utf8'))
    })
  )
}

/** Splits a task file into frontmatter and body, and validates the frontmatter. */
export function parseTask(file: string, text: string): TaskFile {
  const lines = text.split(/\r?\n/)
  const close = lines[0] === '---' ? lines.indexOf('---', 1) : -1
  if (close === -1) {
    const message = 'no frontmatter between --- lines'
    return {file, body: text, ok: false, problems: [{line: 1, message}]}
  }
  const body = lines.slice(close + 1).join('\n')

  const lineCounter = new LineCounter()
  const doc = parseDocument(lines.slice(1, close).join('\n'), {
    lineCounter,
    prettyErrors: false,
  })
  // The frontmatter starts on the file's second line.
  const lineAt = (offset: number) => lineCounter.linePos(offset).line + 1

  if (doc.errors.length > 0) {
    const problems = doc.errors.map((error) => ({
      line: lineAt(error.pos[0]),
      message: error.message,
    }))
    return {file, body, ok: false, problems}
  }

  const result = Frontmatter.safeParse(doc.toJS())
  if (result.success) return {file, body, ok: true, frontmatter: result.data}

  const problems = result.error.issues
    .flatMap((issue) =>
      splitIssue(issue).map(({path, message}) => {
        const offset = nodeAt(doc, path)?.range?.[0]
        return {line: offset === undefined ? 1 : lineAt(offset), message}
      })
    )
    .sort((a, b) => a.line - b.line)
  return {file, body, ok: false, problems}
}

type Located = {path: PropertyKey[]; message: string}

/** One entry per unknown key, so each points at its own line. */
function splitIssue(issue: z.core.$ZodIssue): Located[] {
  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((key) => ({
      path: [...issue.path, key],
      message: `unknown key "${key}"`,
    }))
  }
  return [
    {path: issue.path, message: `${issue.path.join('.')}: ${issue.message}`},
  ]
}

/** The node at `path`; for a map entry, its key, which is where the line starts. */
function nodeAt(doc: Document, path: PropertyKey[]): Node | undefined {
  let node: unknown = doc.contents
  for (const [index, segment] of path.entries()) {
    if (isMap(node)) {
      const pair = node.items.find(
        (item) => (item.key as {value?: unknown} | null)?.value === segment
      )
      if (!pair) return undefined
      node = index === path.length - 1 ? pair.key : pair.value
    } else if (isSeq(node) && typeof segment === 'number') {
      node = node.items[segment]
    } else {
      return undefined
    }
  }
  return node as Node | undefined
}
