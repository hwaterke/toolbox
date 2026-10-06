import {mkdir, writeFile} from 'node:fs/promises'
import nodePath from 'node:path'
import {stringify} from 'yaml'
import {TASKS_DIR} from '../load.ts'
import {nextId} from '../repo.ts'
import {parseStatus} from '../schema.ts'

export type NewOptions = {title: string; status?: string; body?: string}

/**
 * Writes `tasks/TASK-n.md` with the next free id and returns its path,
 * relative to `root`. Status defaults to `idea`. The body is written as given,
 * minus any `## ` section left empty; without one, the file is frontmatter only.
 */
export async function newTask(
  root: string,
  {title, status = 'idea', body = ''}: NewOptions
): Promise<string> {
  if (title.trim() === '') throw new Error('the title is empty')
  if (/[\r\n]/.test(title)) throw new Error('the title is more than one line')
  const frontmatter = stringify(
    {title, status: parseStatus(status)},
    // 0: never fold a long title across lines.
    {lineWidth: 0}
  )
  const filled = dropEmptySections(body)
  const text = `---\n${frontmatter}---\n${filled ? `\n${filled}\n` : ''}`

  const file = `${TASKS_DIR}/${await nextId(root)}.md`
  await mkdir(nodePath.join(root, TASKS_DIR), {recursive: true})
  // wx: never overwrite, should another `new` have taken the id meanwhile.
  await writeFile(nodePath.join(root, file), text, {flag: 'wx'})
  return file
}

/** The body without `## ` sections that hold only blank lines, trimmed. */
function dropEmptySections(body: string): string {
  const sections: string[][] = [[]]
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith('## ')) sections.push([])
    sections.at(-1)?.push(line)
  }
  return sections
    .filter((lines) =>
      lines.some(
        (line, index) =>
          line.trim() !== '' && !(index === 0 && line.startsWith('## '))
      )
    )
    .map((lines) => lines.join('\n').trim())
    .join('\n\n')
}
