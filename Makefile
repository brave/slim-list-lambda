SHELL := /bin/bash

TMP_WORKSPACE := build
TMP_RESOURCES := $(TMP_WORKSPACE)/resources

CHROME_HEADLESS_ZIP_PATH := $(TMP_WORKSPACE)/resources/chromium_headless.zip
CHROME_HEADLESS_PATH := $(TMP_WORKSPACE)/resources/headless-chromium
CHROME_HEADLESS_URL := https://github.com/adieuadieu/serverless-chrome/releases/download/v1.0.0-55/stable-headless-chromium-amazonlinux-2017-03.zip

FUNCTION_NAME=slim-list-generator
FUNCTION_S3_BUCKET=abp-lambda-funcs20181113170947211800000001

clean:
	rm -rf node_modules/
	rm -rf $(TMP_WORKSPACE)

install:
	npm install

install-lambda:
	docker run --rm -v $(PWD):/var/task lambci/lambda:build-nodejs8.10 ./build.sh

lite-build:
	cp -r brave index.js $(TMP_WORKSPACE)

bundle:
	mkdir -p $(TMP_WORKSPACE)/resources/
	cp -r brave node_modules index.js $(TMP_WORKSPACE)/
	rm -rf $(TMP_WORKSPACE)/node_modules/aws-sdk
	find $(TMP_WORKSPACE) -type d -name depot_tools | xargs rm -rf
	rm -rf $(TMP_WORKSPACE)/node_modules/ad-block/test
	rm -rf $(TMP_WORKSPACE)/node_modules/ad-block/node_modules
	rm -rf $(TMP_WORKSPACE)/node_modules/ad-block/vendor
	rm -rf $(TMP_WORKSPACE)/node_modules/eslint
	rm -rf $(TMP_WORKSPACE)/node_modules/eslint-*
	rm -rf $(TMP_WORKSPACE)/node_modules/pluralize
	rm -rf $(TMP_WORKSPACE)/node_modules/bloom-filter-cpp
	rm -rf $(TMP_WORKSPACE)/node_modules/regexpp
	rm -rf $(TMP_WORKSPACE)/node_modules/ajv/dist/regenerator.min.js
	rm -rf $(TMP_WORKSPACE)/node_modules/core-js/web
	rm -rf $(TMP_WORKSPACE)/node_modules/core-js/modules
	rm -rf $(TMP_WORKSPACE)/node_modules/core-js/fn
	rm -rf $(TMP_WORKSPACE)/node_modules/core-js/client
	rm -rf $(TMP_WORKSPACE)/node_modules/core-js/stage
	rm -rf $(TMP_WORKSPACE)/node_modules/nan
	find $(TMP_WORKSPACE)/node_modules/adblock-rs/native/target/release/ -type f -not -name libadblock_rs.so -delete
	find $(TMP_WORKSPACE)/node_modules -type f -name "*.md" -delete
	find $(TMP_WORKSPACE)/node_modules -type d -name "test" | xargs rm -rf
	if [ -a -$(CHROME_HEADLESS_PATH) ]; then curl -L $(CHROME_HEADLESS_URL) --output $(CHROME_HEADLESS_ZIP_PATH) && unzip $(CHROME_HEADLESS_ZIP_PATH) -d $(TMP_RESOURCES) && rm $(CHROME_HEADLESS_ZIP_PATH); fi;
	cd $(TMP_WORKSPACE)/ && zip -r $(FUNCTION_NAME).zip *

test-crawl-dispatch:
	docker run -e LOCAL_TEST=1 -e AWS_ACCESS_KEY_ID=$(AWS_ACCESS_KEY_ID) -e AWS_SECRET_ACCESS_KEY=$(AWS_SECRET_ACCESS_KEY) \
		-e AWS_REGION=$(AWS_REGION) -e PG_HOSTNAME="$(PG_HOSTNAME)" -e PG_PORT=5432 -e PG_USERNAME="$(PG_USERNAME)" \
		-e PG_PASSWORD="$(PG_PASSWORD)" -e DEBUG=1 -e VERBOSE=1 -it -v $(PWD)/$(TMP_WORKSPACE):/var/task lambci/lambda:nodejs8.10 index.dispatch \
		'{"action": "crawl-dispatch", "domains": ["example.com"] }'

test-crawl:
	docker run -e LOCAL_TEST=1 -e AWS_ACCESS_KEY_ID=$(AWS_ACCESS_KEY_ID) -e AWS_SECRET_ACCESS_KEY=$(AWS_SECRET_ACCESS_KEY) -e DEBUG=1 -e VERBOSE=1 -it -v \
		$(PWD)/$(TMP_WORKSPACE):/var/task lambci/lambda:nodejs8.10 index.dispatch \
		'{"action": "crawl", "url": "https://cnn.com", "depth": 2}'

test-record:
	docker run -e LOCAL_TEST=1 -e AWS_ACCESS_KEY_ID=$(AWS_ACCESS_KEY_ID) -e AWS_SECRET_ACCESS_KEY=$(AWS_SECRET_ACCESS_KEY) \
		-e AWS_REGION=$(AWS_REGION) -e PG_HOSTNAME="$(PG_HOSTNAME)" -e PG_PORT=5432 -e PG_USERNAME="$(PG_USERNAME)" \
		-e PG_PASSWORD="$(PG_PASSWORD)" -e DEBUG=1 -e VERBOSE=1 -it -v $(PWD)/$(TMP_WORKSPACE):/var/task lambci/lambda:nodejs8.10 index.dispatch \
		'{"action": "record", "batch": "dc1fb1fc-520d-4655-a858-b6af74ff3b5f"}'

deploy:
	aws s3 cp $(TMP_WORKSPACE)/$(FUNCTION_NAME).zip s3://$(FUNCTION_S3_BUCKET)/$(FUNCTION_NAME).zip
	aws lambda update-function-code --function-name $(FUNCTION_NAME) --s3-bucket $(FUNCTION_S3_BUCKET) --s3-key $(FUNCTION_NAME).zip
	aws lambda update-function-code --function-name $(FUNCTION_NAME)-record --s3-bucket $(FUNCTION_S3_BUCKET) --s3-key $(FUNCTION_NAME).zip

build: clean install-lambda bundle
