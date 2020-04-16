#!/bin/sh

set -a
. .env
set +a

# Upload source maps to Sentry and finalize release
./node_modules/.bin/sentry-cli releases files $RELEASE upload-sourcemaps ./dist
./node_modules/.bin/sentry-cli releases finalize $RELEASE
