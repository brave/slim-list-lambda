'use strict'

const braveDebugLib = require('./brave/debug')
const braveLambdaLib = require('./brave/lambda')

const dispatch = async lambdaEvent => {
  await braveLambdaLib.cleanEnv()

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
    let lambdaModule

    switch (lambdaEvent.action) {
      case 'crawl-dispatch':
      case 'crawl':
      case 'record':
      case 'build':
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
    braveDebugLib.verbose(`Args: ${JSON.stringify(lambdaEvent)}`)
    await lambdaModule.start(msg)
  } catch (error) {
    console.log(error)
    throw error
  }
}

module.exports = {
  dispatch
}
