'use strict'

/**
 * @file
 * A lambda function (and related code) for reading reports about what
 * resources are fetched on each page.
 */

const braveAdBlockLib = require('../adblock')
const braveDbLib = require('../db')
const braveDebugLib = require('../debug')
const braveS3Lib = require('../s3')
const braveValidationLib = require('../validation')

/**
 * Check whether the given invocation arguments for the lambda are valid,
 * and return a version of them that are valid to execute against, after
 * filling in default values, etc.
 *
 * Required arguments:
 *  - batch {string}
 *      A unique identifier for this set of work.  Used to tie together
 *      individual page crawls into a single measurement.
 *  - domain {string}
 *      The domain that was crawled that should be recorded.
 *  - position {string}
 *      The position of the report that should be recorded in the domain's
 *      crawl info (something like 0-2-3).
 *
 * Optional arguments:
 *  - bucket {string}
 *      The S3 bucket to use for reading information from.
 */
const validateArgs = async inputArgs => {
  const stringCheck = braveValidationLib.ofTypeAndTruthy.bind(undefined, 'string')
  const validationRules = {
    batch: {
      validate: braveValidationLib.isStringOfLength.bind(undefined, 36)
    },
    bucket: {
      validate: stringCheck
    },
    domain: {
      validate: stringCheck
    },
    position: {
      validate: stringCheck
    }
  }

  const [isValid, msg] = braveValidationLib.applyValidationRules(
    inputArgs, validationRules)

  if (isValid === false) {
    return [false, msg]
  }

  return [true, Object.freeze(msg)]
}

// Cache rules.dat bytes (immutable per batch) to avoid re-downloading per message;
// a fresh engine is still parsed per message so a bad parse can't poison the batch.
// Bounded LRU keyed by bucket+batch so interleaved crawls don't thrash a single slot.
const RULES_CACHE_MAX_ENTRIES = 8
const _rulesDataCache = new Map()

const _getRulesData = async (bucket, batch) => {
  const cacheKey = `${bucket}/${batch}`

  const cached = _rulesDataCache.get(cacheKey)
  if (cached !== undefined) {
    // Re-insert to mark as most-recently-used.
    _rulesDataCache.delete(cacheKey)
    _rulesDataCache.set(cacheKey, cached)
    braveDebugLib.verbose(`Reusing cached rules.dat for ${cacheKey}`)
    return cached
  }

  braveDebugLib.verbose(`Fetching rules.dat for ${cacheKey}`)
  const rulesBody = await braveS3Lib.read(bucket, `${batch}/rules.dat`)
  const rulesData = await rulesBody.transformToByteArray()

  _rulesDataCache.set(cacheKey, rulesData)
  if (_rulesDataCache.size > RULES_CACHE_MAX_ENTRIES) {
    const oldestKey = _rulesDataCache.keys().next().value
    _rulesDataCache.delete(oldestKey)
  }
  return rulesData
}

const start = async args => {
  const rulesData = await _getRulesData(args.bucket, args.batch)
  const adBlockClient = braveAdBlockLib.createClient(rulesData)

  const crawlDataKey = `${args.batch}/data/${args.domain}/${args.position}.json`
  const crawlDataBuffer = await braveS3Lib.read(args.bucket, crawlDataKey)
  const crawlData = JSON.parse(await crawlDataBuffer.transformToString('utf8'))

  const { url, data, breath, depth, timestamp } = crawlData
  const blockingResult = braveAdBlockLib.applyBlockingRules(adBlockClient, data)

  const dbClient = await braveDbLib.getClient()
  let recordError
  try {
    await braveDbLib.recordPage(dbClient, args.batch, args.domain, url,
      depth, breath, timestamp, blockingResult.allowed, blockingResult.blocked)
  } catch (e) {
    recordError = e
    braveDebugLib.log(`Error when recording to database: ${e.toString()}.`)
  }

  try {
    braveDbLib.closeClient(dbClient, recordError)
  } catch (_) {}
}

module.exports = {
  validateArgs,
  start
}
