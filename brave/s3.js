"use strict";

/**
 * @file
 * Common functions for reading and writing data to S3.
 */

const awsSdkLib = require("aws-sdk");

const debugLib = require("./debug");

const globalS3 = new awsSdkLib.S3({
    apiVersion: "2006-03-01",
    region: "us-east-1",
});

const read = async (bucket, key) => {
    debugLib.log(`Reading from S3: s3://${bucket}/${key}`);
    const s3Query = {
        Bucket: bucket,
        Key: key,
    };

    const result = await globalS3.getObject(s3Query).promise();
    debugLib.log(`Received file of type ${result.ContentType} of size ${result.ContentLength}.`);

    return result.Body;
};

const write = async (bucket, key, bufferOrString) => {
    debugLib.log(`Writing to S3: s3://${bucket}/${key}`);
    const s3Query = {
        Bucket: bucket,
        Key: key,
        Body: bufferOrString,
    };

    await globalS3.putObject(s3Query).promise();
    debugLib.log(`Wrote file to s3://${bucket}/${key}`);
    return true;
};

module.exports = {
    read,
    write,
};
