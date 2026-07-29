'use strict'

const braveDebugLib = require('./brave/debug')
const braveLambdaLib = require('./brave/lambda')

// Sentry (auto-layer) caps breadcrumbs at 100, truncating a full invocation's
// trail; no env var exists, so raise it on the live client. Guarded: the SDK is
// only present via the Lambda layer, not in local/test installs.
try {
  const sentryOptions = require('@sentry/aws-serverless').getClient()?.getOptions()
  if (sentryOptions) {
    sentryOptions.maxBreadcrumbs = 200
  }
} catch (_) {}

const dispatch = async lambdaEvent => {
  try {
    if (typeof lambdaEvent === 'string') {
      lambdaEvent = JSON.parse(lambdaEvent)
    }

    if (lambdaEvent.Records) {
      // Check to see if we're receiving data from SQS
      for (const args of lambdaEvent.Records) {
        const processedLambdaArgs = JSON.parse(args.body)
        await dispatch(processedLambdaArgs)
      }
      return
    }

    braveDebugLib.log(`Invocation: ${JSON.stringify(lambdaEvent)}`)
    await braveLambdaLib.cleanEnv()
    let lambdaModule

    switch (lambdaEvent.action) {
      case 'crawl-dispatch':
      case 'crawl':
      case 'record':
      case 'build':
      case 'assemble':
        lambdaModule = require(`./brave/lambda_actions/${lambdaEvent.action}`)
        break

      default:
        console.log('Received unexpected lambda action: ' +
                    lambdaEvent.action)
        return
    }

    const [areValidArgs, msg] = await lambdaModule.validateArgs(lambdaEvent)
    if (areValidArgs === false) {
      braveDebugLib.log(`Invalid arguments for action: ${lambdaEvent.action}`)
      braveDebugLib.log(`Received: ${JSON.stringify(lambdaEvent)}`)
      braveDebugLib.log(`Error: ${msg}`)
      throw msg
    }

    braveDebugLib.verbose(`Starting action: ${lambdaEvent.action}`)
    await lambdaModule.start(msg)
    braveDebugLib.verbose('Finished processing report')
  } catch (error) {
    console.error(error)
    throw error
  }
}

module.exports = {
  dispatch
}
