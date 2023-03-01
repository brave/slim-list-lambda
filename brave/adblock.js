'use strict'

/**
 * @file
 * Light convenience wrapper function around the brave adblock lib.
 */

const adblockRsLib = require('adblock-rs')

const braveDebugLib = require('./debug')

const serializeRules = rules => {
  braveDebugLib.verbose(`Serializing ${rules.length} rules`)
  const filterSet = new adblockRsLib.FilterSet(true)
  filterSet.addFilters(rules, { format: adblockRsLib.FilterFormat.STANDARD, rule_types: adblockRsLib.RuleTypes.NETWORK_ONLY })
  const adBlockArgs = {
    optimize: false
  }
  const adBlockClient = new adblockRsLib.Engine(filterSet, adBlockArgs)
  // TODO migrate to `adBlockClient.serializeRaw()` once Brave iOS has
  // supported reading it for long enough
  const adBlockDat = adBlockClient.serializeCompressed()
  const adBlockDatBuffer = Buffer.from(adBlockDat)
  braveDebugLib.verbose(`Successfully serialized rules into buffer of length ${adBlockDatBuffer.byteLength}`)
  return adBlockDatBuffer
}

const createClient = adblockDatBuffer => {
  const filterSet = new adblockRsLib.FilterSet(true)
  const adblockClient = new adblockRsLib.Engine(filterSet)
  adblockClient.deserialize(new Uint8Array(adblockDatBuffer).buffer)
  return adblockClient
}

const applyBlockingRules = (adblockClient, requests) => {
  braveDebugLib.verbose(`Applying filter rules to ${requests.length} requests`)
  const allowed = []
  const blocked = []

  for (const aReport of requests) {
    const frameUrl = aReport[3]
    const requestType = aReport[4]
    const requestUrl = aReport[5]

    const matchResult = adblockClient.check(requestUrl, frameUrl, requestType, true)
    if (matchResult.matched === false) {
      if (matchResult.exception) {
        braveDebugLib.verbose(`Would block ${requestUrl} in frame ${frameUrl} of type ${requestType} with rule ${matchResult.filter} but excepted by ${matchResult.exception}`)
        blocked.push(aReport.concat([matchResult.filter, matchResult.exception]))
        continue
      }

      braveDebugLib.verbose(`Would not block ${requestUrl} in frame ${frameUrl} of type ${requestType}`)
      allowed.push(aReport)
      continue
    }

    braveDebugLib.verbose(`Would block ${requestUrl} in frame ${frameUrl} of type ${requestType} with rule ${matchResult.filter}`)
    blocked.push(aReport.concat([matchResult.filter, matchResult.exception]))
  }

  braveDebugLib.verbose(`Would block ${blocked.length} requests, allow ${allowed.length} requests`)

  const result = Object.create(null)
  result.allowed = allowed
  result.blocked = blocked
  return Object.freeze(result)
}

module.exports = {
  applyBlockingRules,
  createClient,
  serializeRules
}
