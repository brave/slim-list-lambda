Slim List System
===

Slim List is a AWS lambda based crawling system for evaluating which EasyList and EasyPrivacy rules are the most useful.  The main goal of the system is to shrink EasyList and EasyPrivacy so that they can be shipped in the iOS client.

Slim list consists of many AWS parts: S3 for scratch and final resuls, SQS for job queing, and multiple lambdas, including the code included in this repo, along with [brave-experiments/brave-popular-filters-dat-builder](https://github.com/brave-experiments/brave-popular-filters-dat-builder) and [brave-experiments/brave-popular-filters-builder](https://github.com/brave-experiments/brave-popular-filters-builder).

How the Lambdas in the system interact
---
1. This lambda function is the entry point to the whole system.  While its implemented as a single lambda function, its performs four distinct tasks.  In order:

   a. [brave/lambda_actions/crawl-dispatch.js](https://github.com/brave/slim-list-lambda/blob/master/brave/lambda_actions/crawl-dispatch.js) fetches a new Alexa 10k list and then queues up the sites to crawl in SQS.  This function is called once per crawl.

   b. [brave/lambda_actions/crawl.js](https://github.com/brave/slim-list-lambda/blob/master/brave/lambda_actions/crawl.js) is called *per page* that needs to be crawled. It triggers a chrome instance to crawl a page, records everything thats fetched, writes a description of it to S3, and possibly kicks off more `brave/lambda_actions/crawl.js` instances to crawl child pages

   c. [brave/lambda_actions/record.js](https://github.com/brave/slim-list-lambda/blob/master/brave/lambda_actions/record.js) is also called once for each page that is mesured.  This invocation reads all the seralized data from the `crawl.js` invocation, and writes it to postgres.  (This is a separate steps bc the concurrency here is much more restricted than in the 1.b. step, to avoid sinking the DB)

   d. [brave/lambda_actions/build.js](https://github.com/brave/slim-list-lambda/blob/master/brave/lambda_actions/build.js) does the DB side analysis to determine which filter lists rules are popular enough to be included in “slim list”.  It is also called once per crawl.
2. Some time later, [brave-popular-filters-builder](https://github.com/brave-experiments/brave-popular-filters-builder) is called.  This takes the slim list data, combines it with brave owned / authored lists, and coverts it to iOS format and stores the result in S3.  (This function is implemented seperately because it needs to be in python, to call the ab2cb conversion library.
3. Finally, the above function calls [brave-popular-filters-dat-builder](https://github.com/brave-experiments/brave-popular-filters-dat-builder), once for each filter list (the main iOS one, and each regional list) and generates .dat / adblock-rs format versions of each list, which are also stored in S3.  This is its own function bc it needs to use the node runtime, bc there are not currently python bindings for adblock-rs.

Structure of S3 Crawl Data
---
```
    <batch>
      domains.json
      rules.dat
      manifest.json
      data
        <domain>
          <depth-breath>.json
            {url: url crawled,
            data: urls requested,
            depth: depth of this report,
            breath: breath of this report,
            timestamp: ISO timestamp}
```
