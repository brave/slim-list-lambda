'use strict'

const requestPromiseLib = require('request-promise')
const { Engine, FilterSet, FilterFormat, RuleTypes } = require('adblock-rs')

const braveDebugLib = require('../debug')
const braveS3Lib = require('../s3')
const braveValidationLib = require('../validation')

// Static lists that we use entirely in the default set of filters
const COIN_MINER_URL = 'https://raw.githubusercontent.com/brave/adblock-lists/master/coin-miners.txt'
const BREAK_UNBREAK_URL = 'https://raw.githubusercontent.com/brave/adblock-lists/master/brave-unbreak.txt'
const UBLOCK_UNBREAK_URL = 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt'
const NOTIFICATIONS_URL = 'https://easylist-downloads.adblockplus.org/fanboy-notifications.txt'
const IOS_SPECIFIC_URL = 'https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-ios-specific.txt'
const STATIC_RULE_URLS = [COIN_MINER_URL, BREAK_UNBREAK_URL, UBLOCK_UNBREAK_URL, NOTIFICATIONS_URL, IOS_SPECIFIC_URL]

const REGIONAL_CATALOG_URL = 'https://raw.githubusercontent.com/brave/adblock-resources/master/filter_lists/regional.json'

/**
 * @file
 * Lambda action for assembling adblock-rust DAT files and iOS content-blocking
 * files from the slim list.
 */

/**
 * Check whether the given invocation arguments for the lambda are valid,
 * and return a version of them that are valid, after doing things like
 * filling in optional arguments, etc.
 *
 * Optional arguments
 *  - slimListS3Bucket {string}
 *      The S3 bucket to read from. Defaults to `adblock-data`
 *  - slimListS3Key {string}
 *      The S3 key to read slim list from.  Defaults to `slim-list/latest.json`
 *  - destS3Bucket {string}
 *      The S3 bucket to write to. Defaults to `adblock-data`
 *
 * @return [bool, object|string]
 *   Returns either false, and then a string describing the error in the
 *   arguments, or true, and a frozen object with arguments prepared for
 *   operating on.
 */
const validateArgs = async inputArgs => {
  const isString = braveValidationLib.ofTypeAndTruthy.bind(undefined, 'string')
  const validationRules = {
    slimListS3Bucket: {
      validate: isString,
      default: 'adblock-data'
    },
    slimListS3Key: {
      validate: isString,
      default: 'slim-list/latest.json'
    },
    readAcl: {
      validate: isString,
      default: 'uri="http://acs.amazonaws.com/groups/global/AuthenticatedUsers"'
    },
    destS3Bucket: {
      validate: isString,
      default: 'adblock-data'
    }
  }

  const [isValid, msg] = braveValidationLib.applyValidationRules(
    inputArgs, validationRules)

  if (isValid === false) {
    return [false, msg]
  }

  return [true, Object.freeze(msg)]
}

/**
 * Lambda function to build content blocking rules and a corresponding DAT file
 * from an existing slim-list.
 */
const start = async args => {
  const rulesToAssemble = JSON.parse((await braveS3Lib.read(args.slimListS3Bucket, args.slimListS3Key)).toString('utf8'))

  if (rulesToAssemble.length === 0) {
    const errMsg = '0 rules were fetched from the slim list bucket. This should never happen.'
    throw Error(errMsg)
  }

  braveDebugLib.log(`Fetched ${rulesToAssemble.length} rules from the slim list bucket.`)

  braveDebugLib.log('About to fetch and add rules from static lists')
  const staticRuleLists = await Promise.all(STATIC_RULE_URLS.map(requestPromiseLib))
  for (const staticRuleList of staticRuleLists) {
    const staticRules = staticRuleList.split('\n')
    rulesToAssemble.push(...staticRules)
  }
  braveDebugLib.log(`Successfully added rules from static lists, got ${rulesToAssemble.length} rules in total`)

  braveDebugLib.log('About to convert default list to iOS content blocking syntax')
  const { contentBlockingRules, datBuffer, filtersUsed } = convertRules(rulesToAssemble, FilterFormat.STANDARD)
  braveDebugLib.log('Saving the set of default rules used')
  await braveS3Lib.write(args.destS3Bucket, 'ios/latest.txt', filtersUsed, args.readAcl, 'text/plain')

  braveDebugLib.log('Saving the new default content-blocking rules')
  await braveS3Lib.write(args.destS3Bucket, 'ios/latest.json', contentBlockingRules, args.readAcl, 'application/json')

  braveDebugLib.log('Saving the new default DAT')
  await braveS3Lib.write(args.destS3Bucket, 'ios/latest.dat', datBuffer, args.readAcl)

  const regionalCatalog = JSON.parse(await requestPromiseLib(REGIONAL_CATALOG_URL))
  for (const regionalList of regionalCatalog) {
    const regionalListContent = (await requestPromiseLib(regionalList.url)).trim()
    if (regionalListContent.length === 0) {
      console.error(`${regionalList.title} returned an empty result. Skipping.`)
      continue
    }
    const rules = regionalListContent.split('\n')
    braveDebugLib.log(`About to convert ${regionalList.title} to iOS content blocking syntax`)
    const { contentBlockingRules, datBuffer, filtersUsed } = convertRules(rules, regionalList.format)
    braveDebugLib.log(`Saving the set of rules used from ${regionalList.title}`)
    await braveS3Lib.write(args.destS3Bucket, `ios/${regionalList.uuid}-latest.txt`, filtersUsed, args.readAcl, 'text/plain')

    braveDebugLib.log(`Saving the new content-blocking rules for ${regionalList.title}`)
    await braveS3Lib.write(args.destS3Bucket, `ios/${regionalList.uuid}-latest.json`, contentBlockingRules, args.readAcl, 'application/json')

    braveDebugLib.log(`Saving the new DAT for ${regionalList.title}`)
    await braveS3Lib.write(args.destS3Bucket, `ios/${regionalList.uuid}-latest.dat`, datBuffer, args.readAcl)
  }
}

// Converts a single list of rules (all in the same format) to content blocking and DAT representations.
//
// Returns { contentBlockingRules, datBuffer } as a JSON string and Buffer, respectively.
const convertRules = (rules, format) => {
  const filterSet = new FilterSet(true)
  filterSet.addFilters(rules, { format, rule_types: RuleTypes.NETWORK_ONLY })

  const { contentBlockingRules, filtersUsed } = filterSet.intoContentBlocking()
  braveDebugLib.log(`Successfully converted ${filtersUsed.length} into ${contentBlockingRules.length} content blocking rules`)

  if (filtersUsed.length === 0 || contentBlockingRules.length === 0) {
    const errMsg = 'Looks like something is wrong with adblock-rust. ' +
                   'There should never be zero rules generated.'
    throw Error(errMsg)
  }

  braveDebugLib.log('About to serialize a DAT from the successfully converted rules')
  const iosFilterSet = new FilterSet(true)
  iosFilterSet.addFilters(filtersUsed)
  const engine = new Engine(iosFilterSet, { optimize: false })
  // TODO migrate to `engine.serializeRaw()` once Brave iOS has supported it
  // for long enough
  const iosDat = engine.serializeCompressed()
  const datBuffer = Buffer.from(iosDat)

  if (datBuffer.byteLength === 0) {
    const errMsg = 'Looks like something is wrong with adblock-rust. ' +
                   'The generated DAT was empty.'
    throw Error(errMsg)
  }
  braveDebugLib.log(`Successfully serialized rules into buffer of length ${datBuffer.byteLength}`)

  return { contentBlockingRules: JSON.stringify(contentBlockingRules), datBuffer, filtersUsed: filtersUsed.join('\n') }
}

module.exports = {
  validateArgs,
  start
}
