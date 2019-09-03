"use strict";

const utilLib = require("util");

const awsSdkLib = require("aws-sdk");

const debugLib = require("./debug");

const existsPromise = utilLib.promisify(fs.pathExists);
const emptyDirPromise = utilLib.promisify(fs.emptyDir);
const globPromise = utilLib.promisify(globLib);
const rmdirPromise = utilLib.promisify(fs.rmdir);
const unlinkPromise = utilLib.promisify(fs.unlink);

const possibleTempDirs = [
    "/tmp/data-path",
    "/tmp/cache-dir",
];

const cleanEnv = async _ =>  {
    debugLib.log("Cleaning up...");
    const cleanedDirs = [];
    for (const tempPath of possibleTempDirs) {
        if (await existsPromise(tempPath)) {
            debugLib.log("Removing: " + tempPath);
            await emptyDirPromise(tempPath);
            await rmdirPromise(tempPath);
            cleanedDirs.push(tempPath);
        }
    }
    const coreDumps = await globPromise("/tmp/core.*");
    for (const aCoreDumpPath of coreDumps) {
        await unlinkPromise(aCoreDumpPath);
    }
};

const invokeLambda = async (lambdaName, args) => {
    const lambdaParams = {
        ClientContext: args,
        FunctionName: lambdaName,
        InvocationType: "Event",
        Payload: args,
    };

    debugLib.log(`Calling ${lambdaName} with args ${JSON.stringify(lambdaParams)} as Event.`);

    lambdaParams.ClientContext = JSON.stringify(lambdaParams.ClientContext);
    lambdaParams.Payload = JSON.stringify(lambdaParams.Payload);

    const lambdaClient = new awsSdkLib.Lambda({apiVersion: "2015-03-31"});
    await lambdaClient.invoke(lambdaParams).promise();
};

const getLambdaResponse = async (lambdaName, args) => {
    const lambdaParams = {
        ClientContext: args,
        FunctionName: lambdaName,
        InvocationType: "RequestResponse",
        Payload: args,
    };

    debugLib.log(`Calling ${lambdaName} with args ${JSON.stringify(lambdaParams)} as RequestResponse.`);

    lambdaParams.ClientContext = JSON.stringify(lambdaParams.ClientContext);
    lambdaParams.Payload = JSON.stringify(lambdaParams.Payload);

    const lambdaClient = new awsSdkLib.Lambda({apiVersion: "2015-03-31"});
    const result = await lambdaClient.invoke(lambdaParams).promise();
    return result.Payload.toString("utf8");
};

module.exports = {
    cleanEnv,
    invokeLambda,
    getLambdaResponse,
};
