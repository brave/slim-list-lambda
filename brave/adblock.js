'use strict'

/**
 * @file
 * Light convenience wrapper function around the brave adblock lib.
 */

const adblockRsLib = require('adblock-rs')

const braveDebugLib = require('./debug')

// Non-network request URL schemes that adblock-rs can't parse a hostname from
// (Request::new returns HostnameParseError). These are browser-internal or inline
// resources, not real network requests, and show up routinely in crawl data. Drop
// them so they don't abort the batch; anything else that fails to parse is
// unexpected and should surface (with its value) so we can narrow it down.
const NON_NETWORK_SCHEME_RE = /^(?:data|blob|about|javascript):/i

const serializeRules = rules => {
  braveDebugLib.verbose(`Serializing ${rules.length} rules`)
  const filterSet = new adblockRsLib.FilterSet(true)
  filterSet.addFilters(rules, { format: adblockRsLib.FilterFormat.STANDARD, rule_types: adblockRsLib.RuleTypes.NETWORK_ONLY })
  const adBlockArgs = {
    optimize: false
  }
  const adBlockClient = new adblockRsLib.Engine(filterSet, adBlockArgs)
  const adBlockDat = adBlockClient.serialize()
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

    // Drop known non-network schemes up front: adblock-rs would throw
    // "hostname parsing failed" on these, and they aren't real requests to block.
    if (NON_NETWORK_SCHEME_RE.test(requestUrl)) {
      braveDebugLib.verbose(`Dropping non-network request ${requestUrl} in frame ${frameUrl}`)
      continue
    }

    let matchResult
    try {
      matchResult = adblockClient.check(requestUrl, frameUrl, requestType, true)
    } catch (err) {
      // Not a known non-network scheme, so this parse failure is unexpected.
      // Re-throw with the offending values attached so Sentry shows what triggered
      // it (the bare adblock-rs message doesn't include the URL).
      throw new Error(`adblock check failed for requestUrl=${JSON.stringify(requestUrl)} frameUrl=${JSON.stringify(frameUrl)} requestType=${JSON.stringify(requestType)}: ${err.message}`, { cause: err })
    }
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
