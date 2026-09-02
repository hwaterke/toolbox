import {includeIgnoreFile} from '@eslint/compat'
import oclif from 'eslint-config-oclif'
import prettier from 'eslint-config-prettier'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const gitignorePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '.gitignore'
)

export default [
  includeIgnoreFile(gitignorePath),
  ...oclif,
  prettier,
  {
    rules: {
      '@stylistic/lines-between-class-members': 'off',
      '@stylistic/padding-line-between-statements': 'off',
      'no-await-in-loop': 'off',
      'no-constant-condition': 'off',
      'no-return-await': 'off',
      'no-useless-constructor': 'off',
      'object-shorthand': 'off',
      'padding-line-between-statements': 'off',
      'perfectionist/sort-classes': 'off',
      'perfectionist/sort-imports': 'off',
      'perfectionist/sort-interfaces': 'off',
      'perfectionist/sort-intersection-types': 'off',
      'perfectionist/sort-object-types': 'off',
      'perfectionist/sort-named-imports': 'off',
      'perfectionist/sort-sets': 'off',
      'perfectionist/sort-objects': 'off',
      'perfectionist/sort-union-types': 'off',
      'unicorn/filename-case': 'off',
      'unicorn/import-style': 'off',
      'valid-jsdoc': 'off',
    },
  },
]
