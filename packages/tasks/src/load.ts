import {readdir, readFile} from 'node:fs/promises'
import nodePath from 'node:path'
import {
  isMap,
  isSeq,
  LineCounter,
  Parser,
  parseDocument,
  type Document,
  type Node,
} from 'yaml'
import type {z} from 'zod'
import {Frontmatter, STATUSES, TASK_ID} from './schema.ts'

export const TASKS_DIR = 'tasks'

/** One problem in a task file, at a 1-indexed line of that file. */
export type Problem = {line: number; message: string}

/** A problem together with the file it is in. */
export type Finding = Problem & {file: string}

/** A task file, valid or not. `file` is relative to the repo root. */
export type TaskFile = {
  file: string
  /** From the filename; undefined when it is not `TASK-n.md`. */
  id: string | undefined
  /** Undefined when the frontmatter does not parse or fails the schema. */
  frontmatter: Frontmatter | undefined
  /** The line of each `depends` entry, in order. */
  dependsLines: number[]
  /** The whole file. */
  text: string
  /** Everything after the closing `---`; the whole file when there is none. */
  body: string
  /** The file line the body starts on. */
  bodyLine: number
  problems: Problem[]
}

/** A task file with an id and valid frontmatter: one the commands can show. */
export type Task = TaskFile & {id: string; frontmatter: Frontmatter}

export const isTask = (task: TaskFile): task is Task =>
  task.id !== undefined && task.frontmatter !== undefined

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

/** Splits a task file into frontmatter and body, and checks the frontmatter. */
export function parseTask(file: string, text: string): TaskFile {
  const stem = nodePath.basename(file, '.md')
  const id = TASK_ID.test(stem) ? stem : undefined
  const task: TaskFile = {
    file,
    id,
    frontmatter: undefined,
    dependsLines: [],
    text,
    body: text,
    bodyLine: 1,
    problems: [],
  }
  if (!id) task.problems.push({line: 1, message: 'filename is not TASK-n.md'})

  // Some Windows editors start a UTF-8 file with a byte order mark.
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  const close = lines[0] === '---' ? lines.indexOf('---', 1) : -1
  if (close === -1) {
    task.problems.push({line: 1, message: 'no frontmatter between --- lines'})
    return task
  }
  task.body = lines.slice(close + 1).join('\n')
  task.bodyLine = close + 2

  const source = lines.slice(1, close).join('\n')
  const lineCounter = new LineCounter()
  const doc = parseDocument(source, {lineCounter, prettyErrors: false})
  // The frontmatter starts on the file's second line.
  const lineAt = (offset: number) => lineCounter.linePos(offset).line + 1

  if (doc.errors.length > 0) {
    for (const error of doc.errors) {
      task.problems.push({line: lineAt(error.pos[0]), message: error.message})
    }
    return task
  }

  for (const offset of commentOffsets(source)) {
    // An unquoted " #" starts a comment, so `title: Fix #3` reads as "Fix".
    const message = 'comment in frontmatter; quote a value containing " #"'
    task.problems.push({line: lineAt(offset), message})
  }

  const result = Frontmatter.safeParse(doc.toJS(), {reportInput: true})
  if (result.success) {
    task.frontmatter = result.data
    task.dependsLines = (result.data.depends ?? []).map((_, index) =>
      lineAt(nodeAt(doc, ['depends', index])?.range?.[0] ?? 0)
    )
  } else {
    for (const issue of result.error.issues) {
      for (const {path, message} of describe(issue)) {
        const offset = nodeAt(doc, path)?.range?.[0]
        task.problems.push({
          line: offset === undefined ? 1 : lineAt(offset),
          message,
        })
      }
    }
  }
  task.problems.sort((a, b) => a.line - b.line)
  return task
}

/** Where every comment in `source` starts, read off the concrete syntax tree. */
function commentOffsets(source: string): number[] {
  const offsets: number[] = []
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(walk)
    } else if (typeof value === 'object' && value !== null) {
      const token = value as {type?: unknown; offset?: unknown}
      if (token.type === 'comment' && typeof token.offset === 'number') {
        offsets.push(token.offset)
      }
      Object.values(value).forEach(walk)
    }
  }
  for (const token of new Parser().parse(source)) walk(token)
  return offsets
}

type Located = {path: PropertyKey[]; message: string}

/** One message per problem; an issue naming several unknown keys gives one each. */
function describe(issue: z.core.$ZodIssue): Located[] {
  const {path} = issue
  const name = path.join('.')
  const input = JSON.stringify(issue.input)
  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((key) => ({
      path: [...path, key],
      message: `unknown key "${key}"`,
    }))
  }
  if (path.length === 0) return [{path, message: 'frontmatter is not a map'}]
  if (issue.input === undefined) return [{path, message: `missing ${name}`}]
  if (issue.input === null) return [{path, message: `${name} is empty`}]
  if (name === 'status' && issue.code === 'invalid_value') {
    return [{path, message: `status ${input} is not ${STATUSES.join('|')}`}]
  }
  if (issue.code === 'invalid_type') {
    const article = /^[aeiou]/.test(issue.expected) ? 'an' : 'a'
    return [{path, message: `${name} is not ${article} ${issue.expected}`}]
  }
  if (issue.code === 'too_small') return [{path, message: `${name} is empty`}]
  if (issue.code === 'custom') return [{path, message: issue.message}]
  if (issue.code === 'invalid_format') {
    return [{path, message: `${name} ${input} is not a TASK-n id`}]
  }
  return [{path, message: `${name}: ${issue.message}`}]
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
