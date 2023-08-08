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

const start = async args => {
  const rulesData = await braveS3Lib.read(args.bucket,
    `${args.batch}/rules.dat`)
  const adBlockClient = braveAdBlockLib.createClient(rulesData)

  const crawlDataKey = `${args.batch}/data/${args.domain}/${args.position}.json`
  const crawlDataBuffer = await braveS3Lib.read(args.bucket, crawlDataKey)
  const crawlData = JSON.parse(await crawlDataBuffer.transformToString('utf8'))

  const { url, data, breath, depth, timestamp } = crawlData
  const blockingResult = braveAdBlockLib.applyBlockingRules(adBlockClient, data)

  const dbClient = await braveDbLib.getClient()
  try {
    await braveDbLib.recordPage(dbClient, args.batch, args.domain, url,
      depth, breath, timestamp, blockingResult.allowed, blockingResult.blocked)
  } catch (e) {
    braveDebugLib.log(`Error when recording to database: ${e.toString()}.`)
  }

  try {
    await braveDbLib.closeClient(dbClient)
  } catch (_) {}
}

module.exports = {
  validateArgs,
  start
}
