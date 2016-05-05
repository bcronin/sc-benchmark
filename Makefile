.PHONY: demo test test-unittest lint publish build

build: node_modules

node_modules: package.json
	npm update

demo: build
	node examples/bench-01.js

test: test-unittest lint
test-unittest:
	node node_modules/mocha/bin/mocha -c test/unittest.js

lint:
	node node_modules/eslint/bin/eslint.js --no-color index.js examples/

# NOTE: `npm version` automatically creates a git commit and git tag for the
# incremented version
publish: build test
	@if [ $(shell git symbolic-ref --short -q HEAD) = "master" ]; then exit 0; else \
	echo "Current git branch does not appear to be 'master'. Refusing to publish."; exit 1; \
	fi
	npm version patch
	git push
	git push --tags
	npm publish
