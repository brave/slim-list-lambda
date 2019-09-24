'use strict'

/**
 * @file
 * A lambda function (and related code) for reading reports about what
 * resources are fetched on each page.
 */

const braveAdBlockLib = require('../adblock')
const braveDbLib = require('../db')
const braveDebugLib = require('../debug')
const braveLambdaLib = require('../lambda')
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
 *
 * Optional arguments:
 *  - bucket {string}
 *      The S3 bucket to use for reading information from.
 *  - lambdaFunc {string}
 *      The name of the lambda function to call to process the
 *      next domain in the data set.
 *  - index {string}
 *      An index into the domains being processed by this function.
 */
const validateArgs = async inputArgs => {
  const stringCheck = braveValidationLib.ofTypeAndTruthy.bind(undefined, 'string')
  const validationRules = {
    batch: {
      validate: braveValidationLib.isStringOfLength.bind(undefined, 36)
    },
    bucket: {
      validate: stringCheck,
      default: 'com.brave.research.slim-list'
    },
    lambdaFunc: {
      validate: stringCheck,
      default: 'slim-list-generator'
    },
    index: {
      validate: braveValidationLib.isPositiveNumber,
      default: 0
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
  const domainBuffer = await braveS3Lib.read(args.bucket,
    `${args.batch}/domains.json`)
  const domains = JSON.parse(domainBuffer.toString('utf8'))
  const domainIndex = args.index
  const isLastDomain = domainIndex === (domains.length - 1)
  const currentDomain = domains[domainIndex]

  const rulesData = await braveS3Lib.read(args.bucket,
    `${args.batch}/rules.dat`)
  const adBlockClient = braveAdBlockLib.createClient(rulesData)

  const dbClient = await braveDbLib.getClient()

  const keyPrefix = `${args.batch}/data/${currentDomain}/`
  const reportObjectKeys = await braveS3Lib.list(args.bucket, keyPrefix)
  for (const aReportObjectKey of reportObjectKeys) {
    const aReportBuffer = await braveS3Lib.read(args.bucket, aReportObjectKey)
    const aReport = JSON.parse(aReportBuffer.toString('utf8'))
    const { url, data, breath, depth, timestamp } = aReport
    const blockingResult = braveAdBlockLib.applyBlockingRules(adBlockClient, data)
    await braveDbLib.recordPage(dbClient, args.batch, currentDomain, url,
      depth, breath, timestamp, blockingResult.allowed, blockingResult.blocked)
  }

  const progressReport = Object.create(null)
  progressReport.domain = currentDomain
  progressReport.index = args.index
  progressReport.maxIndex = domains.length
  progressReport.timestamp = (new Date()).toISOString()
  progressReport.complete = isLastDomain
  const progressKey = `${args.batch}/progress.json`
  await braveS3Lib.write(args.bucket, progressKey, JSON.stringify(progressReport))

  // If this is the last domain in the batch to record, then we're done.
  // Otherwise, call this same lambda, but with the next index.
  if (isLastDomain) {
    braveDebugLib.log(`Finished processing final record for batch ${args.batch}`)
    return
  }

  const lambdaArgs = {
    batch: args.batch,
    bucket: args.bucket,
    lambdaFunc: args.lambdaFunc,
    index: args.index + 1,
    action: 'record'
  }
  await braveLambdaLib.invoke(args.lambdaFunc, lambdaArgs)
}

module.exports = {
  validateArgs,
  start
}
