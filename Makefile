.PHONY: build run test lint publish doc \
	test-unittest

build: node_modules/.build-sentinel

node_modules/.build-sentinel: package.json
	npm update
	touch node_modules/.build-sentinel

run: build
	node examples/bench-01.js

test: build test-unittest lint
test-unittest:
	node node_modules/mocha/bin/mocha -c test/unittest.js

lint:
	node node_modules/eslint/bin/eslint.js --no-color index.js examples/

# NOTE: `npm version` automatically creates a git commit and git tag for the
# incremented version
publish: build test doc
	@if [ $(shell git symbolic-ref --short -q HEAD) = "master" ]; then exit 0; else \
	echo "Current git branch does not appear to be 'master'. Refusing to publish."; exit 1; \
	fi
	npm version patch
	git push
	git push --tags
	npm publish

doc:
	node node_modules/esdoc/out/src/ESDocCLI.js -c esdoc.config.json
