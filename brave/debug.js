'use strict'

const yesOptions = ['y', 'yes', '1']
const _isDebugMode = yesOptions.includes(process.env.DEBUG)
const _isVerboseMode = yesOptions.includes(process.env.VERBOSE)
const _isTestMode = yesOptions.includes(process.env.LOCAL_TEST)

const isDebugMode = _ => _isDebugMode
const isTestMode = _ => _isTestMode
const isVerboseMode = _ => _isVerboseMode

const log = (msg, override = false) => {
  if (_isDebugMode === false && override === false) {
    return
  }
  console.log(typeof msg === 'string' ? msg : JSON.stringify(msg))
}

const verbose = (msg, override = false) => {
  if (_isVerboseMode === false && override === false) {
    return
  }
  console.log(typeof msg === 'string' ? msg : JSON.stringify(msg))
}

module.exports = {
  isDebugMode,
  isTestMode,
  isVerboseMode,
  log,
  verbose
}
