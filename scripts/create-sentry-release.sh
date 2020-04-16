#!/bin/sh

set -a
. /build/.env
set +a

./node_modules/.bin/sentry-cli releases new -p backend $RELEASE
