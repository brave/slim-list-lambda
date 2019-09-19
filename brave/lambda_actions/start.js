'use strict'

const requestPromiseLib = require('request-promise')

const braveAdBlockLib = require('../adblock')
const braveDbLib = require('../db')
const braveDebugLib = require('../debug')
const braveHashLib = require('../hash')
const braveS3Lib = require('../s3')
const braveSQSLib = require('../sqs')
const braveValidationLib = require('../validation')

/**
 * @file
 * This lambda action does the necessary preparation work for preparing
 * a crawl of a large number of pages (as determined by the alexa lists),
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
 *      An array of domains to crawl.  If this is provided, then the arguments
 *      about fetching domain lists (listS3Bucket, listS3Key) are ignored.
 *  - listS3Bucket {string}
 *      If provided, the name of the S3 bucket that list data will be
 *      pulled from.  This is ignored if `domains` is provided.
 *  - listS3Key {string}
 *      The key to read out of the `listS3Bucket` to fetch lists of domains
 *      to crawl.  This is ignored if `url` is provided.
 *  - destS3Bucket {string}
 *      The S3 bucket to use for recording information into.  Defaults
 *      to `com.brave.research.slim-list`.
 *  - sqsQueue {string}
 *      The SQS queue to write any additional information into.  This will
 *      be used to push any domains / URLs that should be crawled into.
 *      Defaults to `comBraveResearchSlim-list`.
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
    listS3Bucket: {
      validate: isString,
      default: undefined
    },
    listS3Key: {
      validate: isString,
      default: undefined
    },
    destS3Bucket: {
      validate: isString,
      default: 'com.brave.research.slim-list'
    },
    sqsQueue: {
      validate: isString,
      default: 'comBraveResearchSlim-list'
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
      default: 2
    },
    breath: {
      validate: braveValidationLib.isPositiveNumber,
      default: 3
    },
    domains: {
      validate: isAllString,
      default: undefined
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
  let domainsToCrawl = args.domains
  const manifest = Object.create(null)
  manifest.date = (new Date()).toISOString()
  manifest.count = args.count
  manifest.batch = args.batch

  if (domainsToCrawl === undefined) {
    domainsToCrawl = await braveS3Lib
      .read(args.listS3Bucket, args.listS3Key)
      .toString('utf8')
      .split('\n')
    manifest.domainsSource = `s3://${args.listS3Bucket}/${args.listS3Key}`
  } else {
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
    const filterListText = (await requestPromiseLib(filterListUrl)).trim()
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

  await braveS3Lib.write(args.destS3Bucket, `${args.batch}/manifest.json`,
    JSON.stringify(manifest))

  for (const filterListHash of Object.keys(filterListHashTextMap)) {
    await braveS3Lib.write(args.destS3Bucket,
      `${args.batch}/${filterListHash}`,
      filterListHashTextMap[filterListHash])
  }

  await braveS3Lib.write(args.destS3Bucket, `${args.batch}/domains.json`,
    JSON.stringify(domainsToCrawl))

  const adBlockDat = braveAdBlockLib.serializeRules(combinedRules)
  await braveS3Lib.write(args.destS3Bucket, `${args.batch}/rules.dat`,
    adBlockDat)

  for (const aDomain of domainsToCrawl) {
    const jobDesc = Object.create(null)
    jobDesc.batch = args.batch
    jobDesc.url = `http://${aDomain}`
    jobDesc.domain = aDomain
    jobDesc.depth = args.depth
    jobDesc.currentDepth = 1
    jobDesc.breath = args.breath
    jobDesc.currentBreath = 1
    jobDesc.bucket = args.destS3Bucket
    jobDesc.sqsQueue = args.sqsQueue
    await braveSQSLib.write(args.sqsQueue, JSON.stringify(jobDesc))
  }
}

module.exports = {
  validateArgs,
  start
}
