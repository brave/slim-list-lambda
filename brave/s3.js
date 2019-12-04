'use strict'

/**
 * @file
 * Common functions for reading and writing data to S3.
 */

const AWSXRay = require('aws-xray-sdk-core');
const awsSdkLib = AWSXRay.captureAWS(require('aws-sdk'));

const debugLib = require('./debug')

const globalS3 = new awsSdkLib.S3({
  apiVersion: '2006-03-01',
  region: 'us-west-2'
})

AWSXRay.enableManualMode()

const list = async (bucket, prefix) => {
  debugLib.verbose(`Listing items in S3: s3://${bucket}/${prefix}/*`)
  const s3Query = {
    Bucket: bucket,
    Prefix: prefix
  }

  const seg = new AWSXRay.Segment('S3ListFunction');
  const s3_seg = seg.addNewSubsegment('S3 List');
  s3_seg.addAnnotation('list_s3_object', prefix);

  const result = await globalS3.listObjectsV2(s3Query).promise()
  debugLib.verbose(`Received ${result.KeyCount} results in S3 for query.`)
  s3_seg.close() 

  const matchingKeys = []
  for (const object of result.Contents) {
    matchingKeys.push(object.Key)
  }

  return matchingKeys
}

const read = async (bucket, key) => {
  debugLib.verbose(`Reading from S3: s3://${bucket}/${key}`)
  const s3Query = {
    Bucket: bucket,
    Key: key
  }

  const seg = new AWSXRay.Segment('S3ReadFunction');
  const s3_seg = seg.addNewSubsegment('S3 Read');
  s3_seg.addAnnotation('read_s3_object', key);

  const result = await globalS3.getObject(s3Query).promise()
  debugLib.verbose(`Received file of type ${result.ContentType} of size ${result.ContentLength}.`)
  s3_seg.close() 

  return result.Body
}

const write = async (bucket, key, bufferOrString) => {
  debugLib.verbose(`Writing to S3: s3://${bucket}/${key}`)
  const s3Query = {
    Bucket: bucket,
    Key: key,
    Body: bufferOrString
  }

  const seg = new AWSXRay.Segment('S3WriteFunction');
  const s3_seg = seg.addNewSubsegment('S3 Read');
  s3_seg.addAnnotation('write_s3_object', key);

  await globalS3.putObject(s3Query).promise()
  s3_seg.close() 


  debugLib.verbose(`Wrote file to s3://${bucket}/${key}`)
  return true
}

module.exports = {
  list,
  read,
  write
}
