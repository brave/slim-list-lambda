'use strict'

const cryptoLib = require('crypto')

const sha256 = body => {
  const hasher = cryptoLib.createHash('sha256')
  hasher.update(body)
  return hasher.digest('hex')
}

module.exports = {
  sha256
}
