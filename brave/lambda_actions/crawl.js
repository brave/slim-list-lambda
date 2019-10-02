'use strict'

const urlLib = require('url')

const puppeteerLib = require('puppeteer-core')
const randomJsLib = require('random-js')
const tldjsLib = require('tldjs')
const validUrlLib = require('valid-url')

const braveDebugLib = require('../debug')
const braveHashLib = require('../hash')
const braveResourcesLib = require('../resources')
const braveSQSLib = require('../sqs')
const braveS3Lib = require('../s3')
const braveValidationLib = require('../validation')

/**
 * @file
 * This lambda is response for recording URLs fetched on a specific page,
 * noting which URLs would be blocked and which would be allowed (and in
 * what frame), recording all this information to S3, and possibly
 * finding other eTLD+1 URLs on the page to crawl (and if so, writing those
 * URLs to a SQS instance).
 */

/**
 * Check whether the given invocation arguments for the lambda are valid,
 * and return a version of them that are valid, after doing things like
 * filling in optional arguments, etc.
 *
 * These arguments are all required.
 *  - batch {string}
 *      A unique identifier for this set of work.  Used to tie together
 *      individual page crawls into a single measurement.
 *  - url {string}
 *      The URL to crawl.  Must be a valid URL.
 *  - domain {string}
 *      The domain that initiated this crawl.
 *  - depth {number}
 *      The number of pages deep to crawl on this batch _including_ the
 *      landing page.
 *  - currentDepth {number}
 *      The depth index of the current item being crawled.
 *  - breath {number}
 *      The number of pages deep to recuse in this crawl.
 *  - currentBreath {number}
 *      The breath index of the current item being crawled.  Must be <=
 *      breath.
 *  - bucket {string}
 *      The S3 bucket to use for recording information into.
 *  - key {string}
 *      The key in the bucket to store all information related to this crawl.
 *  - sqsQueue {string}
 *      The SQS queue to write any additional jobs into.
 *
 * Optional args:
 *  - secs {number}
 *      Number of milliseconds to let the page load (defaults to 30_000)
 *  - path {array.number}
 *      The "path" to where this crawl exists in the crawl.
 */
const validateArgs = async inputArgs => {
  const stringCheck = braveValidationLib.ofTypeAndTruthy.bind(undefined, 'string')

  if (braveDebugLib.isTestMode()) {
    inputArgs.batch = 'testtest-test-test-test-testtesttest'
    inputArgs.url = inputArgs.url || 'https://brave.com'
    inputArgs.domain = 'brave.com'
    inputArgs.depth = inputArgs.depth || 0
    inputArgs.currentDepth = 0
    inputArgs.breath = inputArgs.breath || 0
    inputArgs.currentBreath = 0
    inputArgs.bucket = 'com.brave.research.slim-list'
    inputArgs.sqsQueue = 'https://sqs.us-east-1.amazonaws.com/275005321946/brave-slim-list'
    inputArgs.secs = 5000
    inputArgs.path = [0]
  }

  const validationRules = {
    batch: {
      validate: braveValidationLib.isStringOfLength.bind(undefined, 36)
    },
    url: {
      validate: validUrlLib.isWebUri
    },
    domain: {
      validate: stringCheck
    },
    depth: {
      validate: braveValidationLib.isPositiveNumber
    },
    currentDepth: {
      validate: braveValidationLib.isLessThanOrEqual.bind(undefined, inputArgs.depth)
    },
    breath: {
      validate: braveValidationLib.isPositiveNumber
    },
    currentBreath: {
      validate: braveValidationLib.isLessThanOrEqual.bind(undefined, inputArgs.breath)
    },
    bucket: {
      validate: stringCheck
    },
    sqsQueue: {
      validate: stringCheck
    },
    sqsRecordQueue: {
      validate: stringCheck
    },
    secs: {
      validate: braveValidationLib.isPositiveNumber,
      default: 30000
    },
    path: {
      validate: braveValidationLib.allOfType.bind(undefined, 'number'),
      default: [0]
    }
  }

  const [isValid, msg] = braveValidationLib.applyValidationRules(
    inputArgs, validationRules)

  if (isValid === false) {
    return [false, msg]
  }

  return [true, Object.freeze(msg)]
}

const selectETldPlusOneLinks = async (page, count = 3) => {
  const links = await page.$$('a[href]')
  const sameETldLinks = new Set()
  const pageUrl = page.url()
  const mainETld = tldjsLib.getDomain(pageUrl)

  for (const aLink of links) {
    const hrefHandle = await aLink.getProperty('href')
    const hrefValue = await hrefHandle.jsonValue()
    try {
      const hrefUrl = new urlLib.URL(hrefValue.trim(), pageUrl)
      hrefUrl.hash = ''
      hrefUrl.search = ''
      const childUrlString = hrefUrl.toString()
      if (validUrlLib.isWebUri(childUrlString) === false) {
        continue
      }
      const childLinkETld = tldjsLib.getDomain(childUrlString)
      if (childLinkETld !== mainETld) {
        continue
      }
      if (!childUrlString || childUrlString.trim().length === 0) {
        continue
      }
      sameETldLinks.add(childUrlString)
    } catch (_) {
      continue
    }
  }

  const uniqueChildUrls = Array.from(sameETldLinks)
  if (uniqueChildUrls.length <= count) {
    return uniqueChildUrls
  }

  const random = new randomJsLib.Random()
  return random.sample(uniqueChildUrls, count)
}

const onRequestCompleteCallback = async (requestStore, request) => {
  try {
    const frame = request.frame()
    if (frame === null) {
      return
    }

    const requestUrl = request.url()
    braveDebugLib.verbose(`Saw request to: ${requestUrl}`)

    const requestType = request.resourceType()
    const response = await request.response()

    const responseCode = response.status()
    let responseHash = null
    if (response.ok()) {
      const buffer = await response.buffer()
      responseHash = braveHashLib.sha256(buffer)
    }

    const frameId = frame._id
    const frameUrl = frame.url()
    const parentFrameId = frame.parentFrame() ? frame.parentFrame()._id : null
    const dateString = (new Date()).toISOString()

    requestStore.push(
      [dateString, parentFrameId, frameId, frameUrl, requestType, requestUrl,
        responseHash, responseCode])
  } catch (e) {
    braveDebugLib.verbose(`Error when receiving puppeteer response: ${e.toString()}`)
  }
}

const start = async args => {
  const puppeteerLaunchArgs = {
    executablePath: braveResourcesLib.chromiumPath(),
    userDataDir: braveResourcesLib.userDataDirPath(),
    args: [
      '--disable-gpu',
      '--no-sandbox',
      '--single-process',
      '--disable-setuid-sandbox',
      '--no-zygote'
    ]
  }

  braveDebugLib.verbose(`Launching chrome headless with: ${JSON.stringify(puppeteerLaunchArgs)}`)
  const browser = await puppeteerLib.launch(puppeteerLaunchArgs)

  const page = await browser.newPage()
  const report = []

  // We want to let the page run for 30 sec, whether or not the page
  // finishes loading in that time.
  const waitTime = args.secs
  const startTime = Date.now()
  const callbackHandler = onRequestCompleteCallback.bind(undefined, report)
  page.on('requestfinished', callbackHandler)
  try {
    braveDebugLib.verbose(`Requesting url: ${args.url}`)
    await page.goto(args.url)
  } catch (e) {
    if ((e instanceof puppeteerLib.errors.TimeoutError) === false) {
      braveDebugLib.log(`Error doing top level fetch: ${e.toString()}`)
      return
    }
    braveDebugLib.verbose('Received timeout error')
  }
  const endTime = Date.now()
  const timeElapsed = endTime - startTime

  if (timeElapsed < waitTime) {
    const additionalWaitTime = waitTime - timeElapsed
    braveDebugLib.verbose(`Waiting an extra: ${additionalWaitTime}ms`)
    await page.waitFor(additionalWaitTime)
  }

  page.removeListener('requestfinished', callbackHandler)
  braveDebugLib.log(`Captured ${report.length} requests.`)

  // Check to see if we should go "deeper"
  if (args.currentDepth < args.depth) {
    const childUrls = await selectETldPlusOneLinks(page, args.breath)
    for (let i = 0; i < args.breath; i += 1) {
      const aChildUrl = childUrls[i]
      if (!aChildUrl || aChildUrl.trim().length === 0) {
        continue
      }
      braveDebugLib.log(`Queuing up child page: ${aChildUrl}.`)
      const jobDesc = Object.create(null)
      jobDesc.path = args.path.concat([i])
      jobDesc.batch = args.batch
      jobDesc.url = aChildUrl
      jobDesc.domain = args.domain
      jobDesc.depth = args.depth
      jobDesc.currentDepth = args.currentDepth + 1
      jobDesc.breath = args.breath
      jobDesc.currentBreath = i
      jobDesc.bucket = args.bucket
      jobDesc.sqsQueue = args.sqsQueue
      jobDesc.sqsRecordQueue = args.sqsRecordQueue
      jobDesc.action = 'crawl'
      const jobString = JSON.stringify(jobDesc)
      await braveSQSLib.write(jobDesc.sqsQueue, jobString)
    }
  } else {
    braveDebugLib.verbose('Not going deeper in crawl.')
  }

  // Finally, write our results in S3.
  const pathKey = args.path.map(x => x.toString()).join('-')
  const s3Key = `${args.batch}/data/${args.domain}/${pathKey}.json`
  const crawlData = Object.create(null)
  crawlData.url = args.url
  crawlData.data = report
  crawlData.breath = args.currentBreath
  crawlData.depth = args.currentDepth
  crawlData.timestamp = (new Date()).toISOString()
  await braveS3Lib.write(args.bucket, s3Key, JSON.stringify(crawlData))

  const sqsMessage = Object.create(null)
  sqsMessage.batch = args.batch
  sqsMessage.domain = args.domain
  sqsMessage.position = pathKey
  sqsMessage.action = 'record'
  await braveSQSLib.write(args.sqsRecordQueue, JSON.stringify(sqsMessage))

  braveDebugLib.verbose('Wrapping up and closing puppeteer.')
  await browser.close()
}

module.exports = {
  start,
  validateArgs
}
