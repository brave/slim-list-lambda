'use strict'

const { resolveIgnoresFromGitignore } = require('neostandard')

module.exports = require('neostandard')({
  ignores: resolveIgnoresFromGitignore()
})
