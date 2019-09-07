'use const'

/**
 * @file
 * Common functions for writing messages to AWS SQS.
 */

const awsSdkLib = require('aws-sdk')

const debugLib = require('./debug')

const write = async (queue, message) => {
  const sqsClient = new awsSdkLib.SQS({ apiVersion: '2012-11-05' })
  debugLib.log(`Writing message ${message} to SQS: sqs://${queue}`)

  const sqsMessage = Object.create(null)
  sqsMessage.QueueUrl = queue
  sqsMessage.MessageBody = message

  await sqsClient.sendMessage(sqsMessage).promise()
}

module.exports = {
  write
}
