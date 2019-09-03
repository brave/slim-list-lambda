"use strict";

const validUrlLib = require("valid-url");

const braveValidationLib = require("../validation");

/**
 * @file
 * This lambda is response for recording URLs fetched on a specific page,
 * noting which URLs would be blocked and which would be allowed (and in
 * what frame), recording all this information to S3, and possibly
 * finding other eTLD+1 URLs on the page to crawl (and if so, writing those
 * URLs to a SQS instance).
 */

/**
 * Check whether the given invocation arguments for the lambda are valid,
 * and return a version of them that are valid, after doing things like
 * filling in optional arguments, etc.
 *
 * These arguments are all required.
 *  - batch {string}
 *      A unique identifier for this set of work.  Used to tie together
 *      individual page crawls into a single measurement.
 *  - url {string}
 *      The URL to crawl.  Must be a valid URL.
 *  - domain {string}
 *      The domain that initiated this crawl.
 *  - depth {number}
 *      The number of pages deep to crawl on this batch _including_ the
 *      landing page.
 *  - currentDepth {number}
 *      The depth index of the current item being crawled.
 *  - breath {number}
 *      The number of pages deep to recuse in this crawl.
 *  - currentBreath {number}
 *      The breath index of the current item being crawled.  Must be <=
 *      breath.
 *  - bucket {string}
 *      The S3 bucket to use for recording information into.
 *  - key {string}
 *      The key in the bucket to store all information related to this crawl.
 *  - queue {string}
 *      The SQS queue to write any additional jobs into.
 */
const validateArgs = async inputArgs => {
    const stringCheck = braveValidationLib.ofTypeAndTruthy.bind(undefined, "string");
    const validationRules = {
        batch: {
            validate: braveValidationLib.isStringOfLength.bind(undefined, 36),
        },
        url: {
            validate: validUrlLib.isWebUri,
        },
        domain: {
            validate: stringCheck,
        },
        depth: {
            validate: braveValidationLib.isPositiveNumber,
        },
        currentDepth: {
            validate: braveValidationLib.isLessThanOrEqual.bind(undefined, inputArgs.depth),
        },
        breath: {
            validate: braveValidationLib.isPositiveNumber,
        },
        currentBreath: {
            validate: braveValidationLib.isLessThanOrEqual.bind(undefined, inputArgs.breath),
        },
        bucket: {
            validate: stringCheck,
        },
        key: {
            validate: stringCheck,
        },
        queue: {
            validate: stringCheck,
        },
    };

    const [isValid, msg] = braveValidationLib.applyValidationRules(
        inputArgs, validationRules);

    if (isValid === false) {
        return [false, msg];
    }

    return [true, Object.freeze(msg)];
};

module.exports = {
    validateArgs,
};
