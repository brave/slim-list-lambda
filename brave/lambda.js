'use strict'

const fsLib = require('fs-extra')
const utilLib = require('util')

const AWSXRay = require('aws-xray-sdk-core');
const awsSdkLib = AWSXRay.captureAWS(require('aws-sdk'));
const fkillLib = require('fkill')
const globLib = require('glob')

const braveResourcesLib = require('./resources')
const debugLib = require('./debug')

const existsPromise = utilLib.promisify(fsLib.pathExists)
const emptyDirPromise = utilLib.promisify(fsLib.emptyDir)
const globPromise = utilLib.promisify(globLib)
const rmdirPromise = utilLib.promisify(fsLib.rmdir)
const unlinkPromise = utilLib.promisify(fsLib.unlink)

const possibleTempDirs = [
  braveResourcesLib.userDataDirPath(),
  '/tmp/cache-dir'
]

const possibleProcNames = [
  'chromium',
  'headless-chromium'
]

const cleanEnv = async _ => {
  debugLib.verbose('Killing zombie chromiums...')

  for (const procName of possibleProcNames) {
    await fkillLib(procName, {
      force: true,
      ignoreCase: true,
      silent: true
    })
  }

  debugLib.verbose('Cleaning up...')
  const cleanedDirs = []
  for (const tempPath of possibleTempDirs) {
    if (await existsPromise(tempPath)) {
      debugLib.verbose('Removing: ' + tempPath)
      await emptyDirPromise(tempPath)
      await rmdirPromise(tempPath)
      cleanedDirs.push(tempPath)
    }
  }
  const coreDumps = await globPromise('/tmp/core.*')
  for (const aCoreDumpPath of coreDumps) {
    await unlinkPromise(aCoreDumpPath)
  }
}

const invoke = async (lambdaName, args) => {
  const lambdaParams = {
    ClientContext: args,
    FunctionName: lambdaName,
    InvocationType: 'Event',
    Payload: args
  }

  debugLib.verbose(`Calling ${lambdaName} with args ${JSON.stringify(lambdaParams)} as Event.`)

  lambdaParams.ClientContext = JSON.stringify(lambdaParams.ClientContext)
  lambdaParams.Payload = JSON.stringify(lambdaParams.Payload)

  const lambdaClient = new awsSdkLib.Lambda({ apiVersion: '2015-03-31' })
  await lambdaClient.invoke(lambdaParams).promise()
}

const invokeWithResponse = async (lambdaName, args) => {
  const lambdaParams = {
    ClientContext: args,
    FunctionName: lambdaName,
    InvocationType: 'RequestResponse',
    Payload: args
  }

  debugLib.verbose(`Calling ${lambdaName} with args ${JSON.stringify(lambdaParams)} as RequestResponse.`)

  lambdaParams.ClientContext = JSON.stringify(lambdaParams.ClientContext)
  lambdaParams.Payload = JSON.stringify(lambdaParams.Payload)

  const lambdaClient = new awsSdkLib.Lambda({ apiVersion: '2015-03-31' })
  const result = await lambdaClient.invoke(lambdaParams).promise()
  return result.Payload.toString('utf8')
}

module.exports = {
  cleanEnv,
  invoke,
  invokeWithResponse
}
