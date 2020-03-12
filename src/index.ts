import './lib/env';

import { ApolloServer, gql } from 'apollo-server';
import { readFileSync } from 'fs';
import db from './lib/db';

import { Context } from './types';

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