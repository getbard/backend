########
## Build
########
FROM node:12-alpine AS builder
WORKDIR /build

ARG RELEASE

# Install dependencies
COPY . ./
RUN yarn

# Create Sentry release
RUN yarn add -D @sentry/cli
RUN ./scripts/create-sentry-release.sh

# Build the project
RUN yarn build

# Upload Sentry source maps and finalize release
RUN ./scripts/finalize-sentry-release.sh

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