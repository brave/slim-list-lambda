'use strict'

const braveAdBlockLib = require('../adblock')
const braveDbLib = require('../db')
const braveDebugLib = require('../debug')
const braveHashLib = require('../hash')
const braveS3Lib = require('../s3')
const braveSQSLib = require('../sqs')
const braveTrancoLib = require('../tranco')
const braveValidationLib = require('../validation')

/**
 * @file
 * This lambda action does the necessary preparation work for preparing
 * a crawl of a large number of pages (as determined by the Tranco lists),
 * writes that preparatory data into S3, and then kicks off the child workers,
 * that are responsible for crawling individual pages / sites.
 */

/**
 * Check whether the given invocation arguments for the lambda are valid,
 * and return a version of them that are valid, after doing things like
 * filling in optional arguments, etc.
 *
 * These arguments are optional and have defaults.
 *  - domains {array.string}
 *      An array of domains to crawl.  If not provided, domains are determined
 *      by the current Tranco listings.
 *  - destS3Bucket {string}
 *      The S3 bucket to use for recording information into.  Defaults
 *      to `com.brave.research.slim-list`.
 *  - sqsQueue {string}
 *      The SQS queue to write any additional information into.  This will
 *      be used to push any domains / URLs that should be crawled into.
 *      Defaults to `https://sqs.us-east-1.amazonaws.com/275005321946/brave-slim-list`
 *  - sqsRecordQueue {string}
 *      The SQS queue used for keeping track of which reports are ready
 *      to be recorded in to the database.
 *      Defaults to `https://sqs.us-east-1.amazonaws.com/275005321946/brave-slim-list-record`
 *  - lists {array.string}
 *      A list of filter lists to measure on this batch.  By default uses
 *      ["https://easylist.to/easylist/easylist.txt",
 *          "https://easylist.to/easylist/easyprivacy.txt"]
 *  - batch {string}
 *      A unique identifier for this set of work.  Used to tie together
 *      individual page crawls into a single measurement.  If not provided,
 *      the a new uuid4 is generated.
 *  - count {number}
 *      The maximum number of domains to fetch from the alexa list.  Defaults
 *      to 1000.
 *  - tags {array.string}
 *      An array of optional tags to use to record in the database, to note
 *      optional information about this crawl.  Defaults to an empty array.
 *  - depth {number}
 *      The number of pages deep to crawl on this batch _including_ the
 *      landing page.  Defaults to 2.
 *  - breath {number}
 *      The number of same eTLD+1 pages to look for per "depth" / recursion.
 *      Defaults to 3.
 *  - readAcl {string}
 *      The S3 ACL associated to objects that are written.
 *      Defaults to 'uri="http://acs.amazonaws.com/groups/global/AuthenticatedUsers"'
 *
 * @return [bool, object|string]
 *   Returns either false, and then a string describing the error in the
 *   arguments, or true, and a frozen object with arguments prepared for
 *   the crawl.
 */
const validateArgs = async inputArgs => {
  const genUuid4 = require('uuid/v4')
  const isString = braveValidationLib.ofTypeAndTruthy.bind(undefined, 'string')
  const isAllString = braveValidationLib.allOfTypeAndTruthy.bind(undefined, 'string')

  const validationRules = {
    destS3Bucket: {
      validate: isString,
      default: 'com.brave.research.slim-list'
    },
    sqsQueue: {
      validate: isString,
      default: 'https://sqs.us-east-1.amazonaws.com/275005321946/brave-slim-list'
    },
    sqsRecordQueue: {
      validate: isString,
      default: 'https://sqs.us-east-1.amazonaws.com/275005321946/brave-slim-list-record'
    },
    lists: {
      validate: isAllString,
      default: [
        'https://easylist.to/easylist/easylist.txt',
        'https://easylist.to/easylist/easyprivacy.txt'
      ]
    },
    batch: {
      validate: isString,
      default: genUuid4
    },
    count: {
      validate: braveValidationLib.isPositiveNumber,
      default: 1000
    },
    tags: {
      validate: isAllString,
      default: []
    },
    depth: {
      validate: braveValidationLib.isPositiveNumber,
      default: 1
    },
    breath: {
      validate: braveValidationLib.isPositiveNumber,
      default: 3
    },
    domains: {
      validate: isAllString,
      default: undefined
    },
    readAcl: {
      validate: isString,
      default: 'uri="http://acs.amazonaws.com/groups/global/AuthenticatedUsers"'
    }
  }

  const [isValid, msg] = braveValidationLib.applyValidationRules(
    inputArgs, validationRules)

  if (isValid === false) {
    return [false, msg]
  }

  if (msg.urls === undefined) {
    delete msg.urls
  } else {
    delete msg.countryCode
    delete msg.count
  }

  return [true, Object.freeze(msg)]
}

/**
 * This lambda action does several things:
 *   - if a specific array of URLs is not provided, fetches a list of
 *     urls from an S3 bucket
 *   - fetch each of the relevant filter lists
 *   - combine them into a DAT file using adblock-rs
 *   - determine a key to record everything into S3 with
 *   - write all of the above (along with some additional information
 *     describing the crawl parameters, and similar, for this crawl).
 *   - write a job description for each domain to be crawled into
 *     the SQS queue.
 */
const start = async args => {
  let domainsToCrawl
  const manifest = Object.create(null)
  manifest.date = (new Date()).toISOString()
  manifest.count = args.count
  manifest.batch = args.batch

  if (args.domains === undefined) {
    const [trancoUrl, trancoDomains] = await braveTrancoLib.get(args.count)
    domainsToCrawl = trancoDomains
    manifest.domainsSource = trancoUrl
  } else {
    domainsToCrawl = args.domains
    manifest.domainsSource = 'inline'
  }

  // Record batch information to the database.
  const dbClient = await braveDbLib.getClient()
  await braveDbLib.recordBatchWithTags(dbClient, args.batch, manifest.date,
    args.tags)

  const filterListUrlHashMap = Object.create(null)
  const filterListHashTextMap = Object.create(null)
  for (const filterListUrl of args.lists) {
    braveDebugLib.log('Fetching filter list: ' + filterListUrl)
    const filterListText = (await fetch(filterListUrl).then(r => r.text())).trim()
    const filterListHash = braveHashLib.sha256(filterListText)
    const filterListFetchTimestamp = (new Date()).toISOString()
    filterListUrlHashMap[filterListUrl] = filterListHash
    filterListHashTextMap[filterListHash] = filterListText
    await braveDbLib.recordFilterRules(dbClient, filterListUrl,
      filterListFetchTimestamp, filterListHash, filterListText.split('\n'))
  }

  manifest.filterLists = filterListUrlHashMap
  manifest.tags = args.tags

  const combinedRules = Object
    .values(filterListHashTextMap)
    .reduce((combined, current) => {
      return combined.concat(current.split('\n'))
    }, [])

  const s3KeyPrefix = `${args.batch}/`
  await braveS3Lib.write(args.destS3Bucket, `${s3KeyPrefix}manifest.json`,
    JSON.stringify(manifest), args.readAcl, 'application/json')

  for (const filterListHash of Object.keys(filterListHashTextMap)) {
    await braveS3Lib.write(args.destS3Bucket,
      `${s3KeyPrefix}${filterListHash}`,
      filterListHashTextMap[filterListHash], args.readAcl)
  }

  await braveS3Lib.write(args.destS3Bucket, `${s3KeyPrefix}domains.json`,
    JSON.stringify(domainsToCrawl), args.readAcl, 'application/json')

  const adBlockDat = braveAdBlockLib.serializeRules(combinedRules)
  await braveS3Lib.write(args.destS3Bucket, `${s3KeyPrefix}rules.dat`,
    adBlockDat, args.readAcl)

  for (const aDomain of domainsToCrawl) {
    const jobDesc = Object.create(null)
    jobDesc.action = 'crawl'
    jobDesc.batch = args.batch
    jobDesc.url = `http://${aDomain}`
    jobDesc.domain = aDomain
    jobDesc.depth = args.depth
    jobDesc.currentDepth = 0
    jobDesc.breath = args.breath
    jobDesc.currentBreath = 0
    jobDesc.bucket = args.destS3Bucket
    jobDesc.readAcl = args.readAcl
    jobDesc.sqsQueue = args.sqsQueue
    jobDesc.sqsRecordQueue = args.sqsRecordQueue
    const jobString = JSON.stringify(jobDesc)
    await braveSQSLib.write(args.sqsQueue, jobString)
  }
}

module.exports = {
  validateArgs,
  start
}
