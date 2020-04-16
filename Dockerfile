########
## Build
########
FROM node:12-alpine AS builder
WORKDIR /build

ARG RELEASE
ARG ENV

RUN echo $ENV

# Install dependencies
COPY . ./
RUN yarn

# Create a sentry release
RUN yarn add -D @sentry/cli
RUN ./node_modules/.bin/sentry-cli releases new -p backend $RELEASE
RUN ./node_modules/.bin/sentry-cli releases set-commits --auto $RELEASE

# Build the project
RUN yarn build

# Upload source maps to Sentry and finalize release
RUN ./node_modules/.bin/sentry-cli releases files $RELEASE upload-sourcemaps --ext ts --ext map ./dist
RUN ./node_modules/.bin/sentry-cli releases finalize $RELEASE

########
## Run
########
FROM node:12-alpine
WORKDIR /usr/src/app

# Set release in env
ARG RELEASE
ENV RELEASE=$RELEASE

# Install dependencies
COPY package.json yarn.lock ./
RUN yarn --production

# Setup env config
COPY firebase.json firebase.json
COPY .env .env

COPY --from=builder /build/dist /build/src/schema.graphql ./src/

CMD [ "yarn", "start:production" ]

USER node