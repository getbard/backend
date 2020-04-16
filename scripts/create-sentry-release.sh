#!/bin/sh

set -a
. /build/.env
set +a

./node_modules/.bin/sentry-cli releases new -p backend $RELEASE
./node_modules/.bin/sentry-cli releases set-commits --auto $RELEASE
