SHELL := /bin/bash

TMP_WORKSPACE := build/
TMP_RESROUCES := $(TMP_WORKSPACE)/resources

CHROME_DRIVER_URL := https://chromedriver.storage.googleapis.com/2.37/chromedriver_linux64.zip
CHROME_HEADLESS_URL := https://github.com/adieuadieu/serverless-chrome/releases/download/v1.0.0-38/stable-headless-chromium-amazonlinux-2017-03.zip

FUNCTION_NAME=slim-list-generator
FUNCTION_S3_BUCKET=abp-lambda-funcs20181113170947211800000001

clean:
	rm -rf $(TMP_WORKSPACE)

install:
	npm install

install-lambda:
	docker run --rm -v $(PWD):/var/task lambci/lambda:build-nodejs10.x npm install

lite-build:
	cp -r lib index.js $(TMP_WORKSPACE)

build: clean install-lambda
	mkdir -p $(TMP_WORKSPACE)/resources/
	cp -r lib node_modules index.js $(TMP_WORKSPACE)/
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
	find $(TMP_WORKSPACE)/node_modules -type f -name "*.md" -delete
	find $(TMP_WORKSPACE)/node_modules -type d -name "test" | xargs rm -rf
	curl -L $(CHROME_DRIVER_URL) --output $(TMP_WORKSPACE)/resources/chromedriver.zip
	unzip $(TMP_WORKSPACE)/resources/chromedriver.zip -d $(TMP_WORKSPACE)/resources/
	rm $(TMP_WORKSPACE)/resources/chromedriver.zip
	curl -L $(CHROME_HEADLESS_URL) --output $(TMP_WORKSPACE)/resources/chromium_headless.zip
	unzip $(TMP_WORKSPACE)/resources/chromium_headless.zip -d $(TMP_WORKSPACE)/resources/
	rm $(TMP_WORKSPACE)/resources/chromium_headless.zip
	cd $(TMP_WORKSPACE)/ && zip -r $(FUNCTION_NAME).zip *

test:
	docker run -e AWS_ACCESS_KEY_ID=$(AWS_ACCESS_KEY_ID) -e AWS_SECRET_ACCESS_KEY=$(AWS_SECRET_ACCESS_KEY) \
		-e AWS_REGION=$(AWS_REGION) -e PG_HOSTNAME="$(PG_HOSTNAME)" -e PG_PORT=5432 -e PG_USERNAME="abp" \
		-e PG_PASSWORD="$(PG_PASSWORD)" -e DEBUG=1 -e VERBOSE=1 -it -v $(PWD)/$(TMP_WORKSPACE):/var/task lambci/lambda:nodejs8.10 index.dispatch \
		'{"filtersUrls": [ "https://easylist.to/easylist/easylist.txt", "https://easylist.to/easylist/easyprivacy.txt", \
		"https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt", \
		"https://raw.githubusercontent.com/brave/adblock-lists/master/brave-unbreak.txt", \
		"https://raw.githubusercontent.com/brave/adblock-lists/master/coin-miners.txt"], \
		"batch": "1f366690-6e84-4a2b-b200-8e37b8c9d24a", "domain": "www.cnn.com", "rank": 8, "debug": true, "depth": 2, \
		"breath": 3, "tags": [], "region": "global"}'

deploy:
	aws s3 cp $(TMP_WORKSPACE)/$(FUNCTION_NAME).zip s3://$(FUNCTION_S3_BUCKET)/$(FUNCTION_NAME).zip
	aws lambda update-function-code --function-name $(FUNCTION_NAME) --s3-bucket $(FUNCTION_S3_BUCKET) --s3-key $(FUNCTION_NAME).zip
