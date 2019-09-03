"use strict";

const braveLambdaLib = require("./brave/lambda");

const dispatch = async lambdaEvent => {
    await braveLambdaLib.cleanEnv();

    try {
        if (lambdaEvent.Records) {
            // Check to see if we're receiving data from SQS
            for (const args of lambdaEvent.Records) {
                const processedLambdaArgs = JSON.parse(args.body);
                await dispatch(processedLambdaArgs);
            }
            return;
        }

        switch (lambdaEvent.action) {
            case "start":
                break;

            case "crawl":
                break;

            case "aggregate":
                break;

            default:
                console.log("Received unexpected lambda action: "
                    + lambdaEvent.action);
                return;
        }
    } catch (error) {
        console.log(error);
    }
};

module.exports = {
    dispatch,
};
