'use const'

/**
 * @file
 * Common functions for writing messages to AWS SQS.
 */

const {
  SQS
} = require("@aws-sdk/client-sqs")

const debugLib = require('./debug')

const write = async (queue, message) => {
  const msgFlat = typeof message === 'string' ? message : JSON.stringify(message)
  const sqsClient = new SQS({ apiVersion: '2012-11-05' })
  debugLib.verbose(`Writing message ${msgFlat} to SQS: ${queue}`)

  const sqsMessage = Object.create(null)
  sqsMessage.QueueUrl = queue
  sqsMessage.MessageBody = msgFlat

  await sqsClient.sendMessage(sqsMessage)
}

module.exports = {
  write
}
