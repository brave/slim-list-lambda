'use const'

/**
 * @file
 * Common functions for writing messages to AWS SQS.
 */

const {
  SQS
} = require("@aws-sdk/client-sqs")
const httpsLib = require('https')

const debugLib = require('./debug')

const sqsClient = new SQS({
  apiVersion: '2012-11-05',
  requestHandler: {
    httpsAgent: new httpsLib.Agent({
      keepAlive: true,
      maxSockets: 300
    })
  }
})

const write = async (queue, message) => {
  const msgFlat = typeof message === 'string' ? message : JSON.stringify(message)
  debugLib.verbose(`Writing message ${msgFlat} to SQS: ${queue}`)

  const sqsMessage = Object.create(null)
  sqsMessage.QueueUrl = queue
  sqsMessage.MessageBody = msgFlat

  await sqsClient.sendMessage(sqsMessage)
}

module.exports = {
  write
}
