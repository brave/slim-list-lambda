'use strict'

const { resolveIgnoresFromGitignore } = require('neostandard')

// `standard` implicitly skipped everything in .gitignore; flat config does not,
// so reproduce that behaviour explicitly (build/, config.js, ...).
module.exports = require('neostandard')({
  ignores: resolveIgnoresFromGitignore()
})
