########
## Build
########
FROM node:12-alpine AS builder
WORKDIR /build

# Install dependencies
COPY package.json yarn.lock ./
RUN yarn

# Build the project
COPY . ./
RUN yarn build


########
## Run
########
FROM node:12-alpine
WORKDIR /usr/src/app

# Install dependencies
COPY package.json yarn.lock ./
RUN yarn --production

COPY firebase.json firebase.json
COPY .env .env

COPY --from=builder /build/dist /build/src/schema.graphql ./src/

CMD [ "yarn", "start:production" ]

USER node