'use strict'

/**
 * @file
 * Light convenience wrapper function around the brave adblock lib.
 */

const adblockRsLib = require('adblock-rs')

const braveDebugLib = require('./debug')

const serializeRules = rules => {
  braveDebugLib.log(`Serializing ${rules.length} rules`)
  const adBlockDat = (new adblockRsLib.Engine(rules, true)).serialize()
  const adBlockDatBuffer = Buffer.from(adBlockDat)
  braveDebugLib.log(`Successfully serialized rules into buffer of length ${adBlockDatBuffer.byteLength}`)
  return adBlockDatBuffer
}

const createClient = adblockDat => {
  const adblockClient = new adblockRsLib.Engine([], true)
  adblockClient.deserialize(adblockDat)
  return adblockClient
}

const applyBlockingRules = (adblockClient, requests) => {
  braveDebugLib.log(`Applying filter rules to ${requests.length} requests`)
  const allowed = []
  const blocked = []

  for (const aReport of requests) {
    const frameUrl = aReport[3]
    const requestType = aReport[4]
    const requestUrl = aReport[5]

    const matchResult = adblockClient.check(requestUrl, frameUrl, requestType, true)
    if (matchResult.matched === false) {
      braveDebugLib.verbose(`Would not block ${requestUrl} in frame ${frameUrl} of type ${requestType}`)
      allowed.push(aReport)
      continue
    }

    braveDebugLib.verbose(`Would block ${requestUrl} in frame ${frameUrl} of type ${requestType} with rule ${matchResult.filter}`)
    if (matchResult.exception !== null) {
      braveDebugLib.verbose(`…but excepted by ${matchResult.exception}`)
    }

    blocked.push(aReport.concat([matchResult.filter, matchResult.exception]))
  }

  braveDebugLib.log(`Would block ${blocked.length} requests, allow ${allowed.length} requests`)

  const result = Object.create(null)
  result.allowed = allowed
  result.blocked = blocked
  return result
}

module.exports = {
  applyBlockingRules,
  createClient,
  serializeRules
}
