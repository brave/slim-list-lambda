'use strict'

/**
 * @file
 * Helper functions for keeping track of where bundled assets are stored
 * in the lambda.
 */

const pathLib = require('path')

const chromiumPath = _ => {
  return pathLib.join(__dirname, '..', 'resources', 'headless-chromium')
}

const userDataDirPath = _ => {
  return pathLib.join('/tmp', 'data-dir')
}

module.exports = {
  chromiumPath,
  userDataDirPath
}
