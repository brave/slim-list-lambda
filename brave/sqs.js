'use const'

/**
 * @file
 * Common functions for writing messages to AWS SQS.
 */

const AWSXRay = require('aws-xray-sdk-core');
const awsSdkLib = AWSXRay.captureAWS(require('aws-sdk'));

const debugLib = require('./debug')

const write = async (queue, message) => {
  const msgFlat = typeof message === 'string' ? message : JSON.stringify(message)
  const sqsClient = new awsSdkLib.SQS({ apiVersion: '2012-11-05' })
  debugLib.verbose(`Writing message ${msgFlat} to SQS: ${queue}`)

  const seg = AWSXRay.getSegment();
  seg.addAnnotation('sqs_queue', queue);
  seg.addAnnotation('sqs_message', msgFlat);

  const sqsMessage = Object.create(null)
  sqsMessage.QueueUrl = queue
  sqsMessage.MessageBody = msgFlat

  await sqsClient.sendMessage(sqsMessage).promise()
}

module.exports = {
  write
}
