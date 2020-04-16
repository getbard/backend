#!/bin/sh

set -a
. .env
set +a

# Upload source maps to Sentry and finalize release
./node_modules/.bin/sentry-cli releases files $RELEASE upload-sourcemaps --ext ts --ext map ./dist
./node_modules/.bin/sentry-cli releases finalize $RELEASE
