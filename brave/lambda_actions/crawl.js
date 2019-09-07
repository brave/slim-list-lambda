'use strict'

const urlLib = require('url')

const puppeteerLib = require('puppeteer-extra')
const puppeteerStealthLib = require('puppeteer-extra-plugin-stealth')
const randomJsLib = require('random-js')
const tldjsLib = require('tldjs')
const validUrlLib = require('valid-url')

const braveResourcesLib = require('../resources')
const braveSQSLib = require('../sqs')
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
 */
const validateArgs = async inputArgs => {
  const stringCheck = braveValidationLib.ofTypeAndTruthy.bind(undefined, 'string')
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
      const hrefUrl = new urlLib.URL(hrefValue, pageUrl)
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
      sameETldLinks.add(childUrlString)
    } catch (_) {
      continue
    }
  }

  const uniqueChildUrls = Array.from(sameETldLinks)
  if (uniqueChildUrls.length <= count) {
    return uniqueChildUrls
  }

  return randomJsLib.sample(uniqueChildUrls, count)
}

const onRequestCallback = (requestStore, interceptedRequest) => {
  const requestType = interceptedRequest.resourceType()
  const requestUrl = interceptedRequest.url()
  const frame = interceptedRequest.frame()
  if (frame !== null) {
    return
  }

  const frameId = frame._id
  const frameUrl = frame.url()
  const parentFrameId = frame.parentFrame() ? frame.parentFrame()._id : null
  const dateString = (new Date()).toISOString()

  requestStore.push(
    [dateString, parentFrameId, frameId, frameUrl, requestType, requestUrl])
}

const start = async args => {
  puppeteerLib.use(puppeteerStealthLib())
  const browser = await puppeteerLib.launch({
    executablePath: braveResourcesLib.chromiumPath(),
    userDataDir: braveResourcesLib.userDataDirPath()
  })

  const page = await browser.newPage()
  const report = []

  // We want to let the page run for 30 sec, whether or not the page
  // finishes loading in that time.
  const waitTime = 30000
  const startTime = Date.now()
  const callbackHandler = onRequestCallback.bind(undefined, report)
  page.on('request', callbackHandler)
  try {
    await page.goto(args.url)
  } catch (e) {
    if ((e instanceof puppeteerLib.errors.TimeoutError) === false) {
      throw e
    }
  }
  const endTime = Date.now()
  const timeElapsed = endTime - startTime

  if (timeElapsed > waitTime) {
    await page.waitFor(waitTime - timeElapsed)
  }

  page.removeListener('request', callbackHandler)

  // Check to see if we should go "deeper"
  if (args.currentDepth < args.depth) {
    const childUrls = selectETldPlusOneLinks(page, args.breath)
    for (let i = 1; i <= args.breath; i += 1) {
      const aChildUrl = childUrls[i]
      const jobDesc = Object.create(null)
      jobDesc.batch = args.batch
      jobDesc.url = aChildUrl
      jobDesc.domain = args.domain
      jobDesc.depth = args.depth
      jobDesc.currentDepth = args.depth + 1
      jobDesc.breath = args.breath
      jobDesc.currentBreath = i
      jobDesc.bucket = args.bucket
      jobDesc.sqsQueue = args.sqsQueue
      await braveSQSLib.write(jobDesc)
    }
  }

  // Finally, write our results in S3.
  // @tbd
}

module.exports = {
  start,
  validateArgs
}
