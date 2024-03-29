'use strict'

/**
 * @file
 * Common functions for reading and writing data to S3.
 */

const {
  S3
} = require("@aws-sdk/client-s3")

const debugLib = require('./debug')

const globalS3 = new S3({
  apiVersion: '2006-03-01',
  region: process.env.AWS_REGION || 'us-west-2'
})

const list = async (bucket, prefix) => {
  debugLib.verbose(`Listing items in S3: s3://${bucket}/${prefix}/*`)
  const s3Query = {
    Bucket: bucket,
    Prefix: prefix
  }

  const result = await globalS3.listObjectsV2(s3Query)
  debugLib.verbose(`Received ${result.KeyCount} results in S3 for query.`)

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

  const result = await globalS3.getObject(s3Query)
  debugLib.verbose(`Received file of type ${result.ContentType} of size ${result.ContentLength}.`)

  return result.Body
}

const write = async (bucket, key, bufferOrString, readAcl, contentType='application/octet-stream') => {
  debugLib.verbose(`Writing to S3: s3://${bucket}/${key}`)
  const s3Query = {
    Bucket: bucket,
    Key: key,
    Body: bufferOrString,
    GrantRead: readAcl,
    ContentType: contentType
  }

  await globalS3.putObject(s3Query)

  debugLib.verbose(`Wrote file to s3://${bucket}/${key}`)
  return true
}

module.exports = {
  list,
  read,
  write
}
