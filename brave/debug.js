'use strict'

const yesOptions = ['y', 'yes', '1']
const _isDebugMode = yesOptions.includes(process.env.DEBUG)
const _isVerboseMode = yesOptions.includes(process.env.VERBOSE)

const isDebugMode = _ => _isDebugMode
const isVerboseMode = _ => _isVerboseMode

const log = (msg, override = false) => {
  if (_isDebugMode === false && override === false) {
    return
  }
  console.log(JSON.stringify(msg))
}

const verbose = (msg, override = false) => {
  if (_isVerboseMode === false && override === false) {
    return
  }
  console.log(JSON.stringify(msg))
}

module.exports = {
  isDebugMode,
  isVerboseMode,
  log,
  verbose
}
