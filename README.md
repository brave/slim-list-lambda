Slim List System
===

Slim List is a AWS lambda based crawling system for evaluating which EasyList and EasyPrivacy rules are the most useful.  The main goal of the system is to shrink EasyList and EasyPrivacy so that they can be shipped in the iOS client.

Slim list consists of many AWS parts: S3 for scratch and final resuls, SQS for job queing, and multiple lambdas included in this repo.

How the Lambdas in the system interact
---
This lambda function is the entry point to the whole system.  While its implemented as a single lambda function, its performs five distinct tasks.  In order:
   1. [brave/lambda_actions/crawl-dispatch.js](https://github.com/brave/slim-list-lambda/blob/master/brave/lambda_actions/crawl-dispatch.js) fetches a new Tracno 10k list and then queues up the sites to crawl in SQS.  This function is called once per crawl.
   2. [brave/lambda_actions/crawl.js](https://github.com/brave/slim-list-lambda/blob/master/brave/lambda_actions/crawl.js) is called *per page* that needs to be crawled. It triggers a chrome instance to crawl a page, records everything thats fetched, writes a description of it to S3, and possibly kicks off more `brave/lambda_actions/crawl.js` instances to crawl child pages
   3. [brave/lambda_actions/record.js](https://github.com/brave/slim-list-lambda/blob/master/brave/lambda_actions/record.js) is also called once for each page that is mesured.  This invocation reads all the seralized data from the `crawl.js` invocation, and writes it to postgres.  (This is a separate step to reduce the number of parallel jobs triggered in 1.iii, to avoid sinking the DB).
   4. [brave/lambda_actions/build.js](https://github.com/brave/slim-list-lambda/blob/master/brave/lambda_actions/build.js) does the DB side analysis to determine which filter lists rules are popular enough to be included in “slim list”.  It is also called once per crawl.
   5. [brave/lambda_actions/assemble.js](https://github.com/brave/slim-list-lambda/blob/master/brave/lambda_actions/assemble.js) combines the slim list data with brave owned/authored lists, and produces an iOS content blocking rule file, as well as a corresponding DAT file to be loaded by adblock-rust browser-side. It will do this for each regional list as well. All of the outputs are stored in S3.

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

Deployment
---

Slim List lambdas are deployed into a staging and production account.  In order to deploy to the staging environment, perform merges/pushes on the `main` branch.  To deploy to production, perform merges/pushes on the `production` branch.  In order to gain access to these AWS environments, please ping DevOps team in #devops Brave Slack channel.
