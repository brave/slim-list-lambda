SHELL := /bin/bash

TMP_WORKSPACE := build
TMP_RESOURCES := $(TMP_WORKSPACE)/resources

DOCKER_IMAGE := slim-list-test:latest

FUNCTION_NAME=slim-list-generator

clean:
	rm -rf node_modules/
	rm -rf $(TMP_WORKSPACE)/

install:
	npm install

install-lambda:
	docker run --rm -v $(PWD):/var/task public.ecr.aws/sam/build-nodejs16.x ./build.sh

lite-build:
	cp -r brave index.js $(TMP_WORKSPACE)/

build-docker:
	docker build -t $(DOCKER_IMAGE) .

bundle:
	mkdir -p $(TMP_RESOURCES)/
	cp -r brave node_modules index.js $(TMP_WORKSPACE)/
	rm -rf $(TMP_WORKSPACE)/node_modules/aws-sdk
	find $(TMP_WORKSPACE)/ -type d -name depot_tools | xargs rm -rf
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
	find $(TMP_WORKSPACE)/node_modules/adblock-rs/js/target/release/ -type f -not -name libadblock_rs.so -delete
	find $(TMP_WORKSPACE)/node_modules -type f -name "*.md" -delete
	find $(TMP_WORKSPACE)/node_modules -type d -name "test" | xargs rm -rf
	cd $(TMP_WORKSPACE)/ && zip -r $(FUNCTION_NAME).zip *

test-crawl-dispatch:
	trap "docker rm -f slim-list-test" EXIT; \
	docker run --rm -p 9000:8080 --name slim-list-test -e LOCAL_TEST=1 -e AWS_ACCESS_KEY_ID=$(AWS_ACCESS_KEY_ID) -e AWS_SECRET_ACCESS_KEY=$(AWS_SECRET_ACCESS_KEY) \
		-e AWS_REGION=$(AWS_REGION) -e PG_HOSTNAME="$(PG_HOSTNAME)" -e PG_PORT=5432 -e PG_USERNAME="$(PG_USERNAME)" \
		-e PG_PASSWORD="$(PG_PASSWORD)" -e DEBUG=1 -e VERBOSE=1 $(DOCKER_IMAGE) index.dispatch & \
	(until </dev/tcp/localhost/9000 ; do sleep 5; done) 2>/dev/null; \
	curl -XPOST "http://localhost:9000/2015-03-31/functions/function/invocations" -d '{"action": "crawl-dispatch", "domains": ["example.com"] }'

test-crawl:
	trap "docker rm -f slim-list-test" EXIT; \
	docker run --rm -p 9000:8080 --name slim-list-test -e LOCAL_TEST=1 -e AWS_ACCESS_KEY_ID=$(AWS_ACCESS_KEY_ID) -e AWS_SECRET_ACCESS_KEY=$(AWS_SECRET_ACCESS_KEY) -e DEBUG=1 -e VERBOSE=1 -v \
		$(PWD)/$(TMP_WORKSPACE):/var/task $(DOCKER_IMAGE) index.dispatch & \
	(until </dev/tcp/localhost/9000 ; do sleep 5; done) 2>/dev/null; \
	curl -XPOST "http://localhost:9000/2015-03-31/functions/function/invocations" -d \
		'{"action": "crawl", "url": "https://cnn.com", "depth": 2, "sqsRecordQueue": "https://sqs.us-east-1.amazonaws.com/${AWS_ACCOUNT_ID}/brave-slim-list-record"}'

test-record:
	trap "docker rm -f slim-list-test" EXIT; \
	docker run --rm -p 9000:8080 --name slim-list-test -e LOCAL_TEST=1 -e AWS_ACCESS_KEY_ID=$(AWS_ACCESS_KEY_ID) -e AWS_SECRET_ACCESS_KEY=$(AWS_SECRET_ACCESS_KEY) \
		-e AWS_REGION=$(AWS_REGION) -e PG_HOSTNAME="$(PG_HOSTNAME)" -e PG_PORT=5432 -e PG_USERNAME="$(PG_USERNAME)" \
		-e PG_PASSWORD="$(PG_PASSWORD)" -e DEBUG=1 -e VERBOSE=1 $(DOCKER_IMAGE) index.dispatch & \
	(until </dev/tcp/localhost/9000 ; do sleep 5; done) 2>/dev/null; \
	curl -XPOST "http://localhost:9000/2015-03-31/functions/function/invocations" -d \
		'{"action": "record", "batch": "$(BATCH)", "domain": "$(DOMAIN)", "position": "$(POSITION)"}'

test-build:
	trap "docker rm -f slim-list-test" EXIT; \
	docker run --rm -p 9000:8080 --name slim-list-test -e LOCAL_TEST=1 -e AWS_ACCESS_KEY_ID=$(AWS_ACCESS_KEY_ID) -e AWS_SECRET_ACCESS_KEY=$(AWS_SECRET_ACCESS_KEY) \
		-e AWS_REGION=$(AWS_REGION) -e PG_HOSTNAME="$(PG_HOSTNAME)" -e PG_PORT=5432 -e PG_USERNAME="$(PG_USERNAME)" \
		-e PG_PASSWORD="$(PG_PASSWORD)" -e DEBUG=1 -e VERBOSE=1 $(DOCKER_IMAGE) index.dispatch & \
	(until </dev/tcp/localhost/9000 ; do sleep 5; done) 2>/dev/null; \
	curl -XPOST "http://localhost:9000/2015-03-31/functions/function/invocations" -d \
		'{"action": "build", "batch": "$(BATCH)"}'

build: clean install-lambda bundle
