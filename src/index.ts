import './lib/env';

import { ApolloServer, gql } from 'apollo-server';
import { readFileSync } from 'fs';
import { Firestore } from '@google-cloud/firestore';

import { Context } from './types';

const db = new Firestore();
db.settings({
  host: `${process.env.DB_HOST}:${process.env.DB_PORT}`,
  ssl: false
});

import resolvers from './resolvers';

const server = new ApolloServer({
  typeDefs: gql`${readFileSync(__dirname.concat('/schema.graphql'), 'utf8')}`,
  resolvers,
  context: (): Context => ({
    db,
  })
});

server
  .listen({ port: process.env.PORT || 4000 })
  .then(({ url }: { url: string }) => {
    console.log(`🚀  Server ready at ${url}`);
  });