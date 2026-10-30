// Bumps the root version (patch | minor | major | x.y.z) and moves the
// Unreleased changelog notes under the new version.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const bump = process.argv[2]
if (!bump) {
  console.error('Usage: pnpm release <patch|minor|major|x.y.z>')
  process.exit(1)
}

const prev = JSON.parse(readFileSync('package.json', 'utf8')).version
execFileSync('npm', ['version', '--no-git-tag-version', bump], { stdio: 'inherit' })
const next = JSON.parse(readFileSync('package.json', 'utf8')).version

const date = new Date().toISOString().slice(0, 10)
const repo = 'https://github.com/EranYonai/hearthside'
let log = readFileSync('CHANGELOG.md', 'utf8')
log = log.replace('## [Unreleased]\n', `## [Unreleased]\n\n## [${next}] - ${date}\n`)
log = log.replace(
  /^\[Unreleased\]: .*$/m,
  `[Unreleased]: ${repo}/compare/v${next}...HEAD\n[${next}]: ${repo}/compare/v${prev}...v${next}`,
)
writeFileSync('CHANGELOG.md', log)
console.log(`Released notes for ${next} in CHANGELOG.md`)
