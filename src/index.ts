import { ApolloServer, gql } from 'apollo-server';
import { readFileSync } from 'fs';

import resolvers from './resolvers';

const server = new ApolloServer({
  typeDefs: gql`${readFileSync(__dirname.concat('/schema.graphql'), 'utf8')}`,
  resolvers,
});

server
  .listen({ port: process.env.PORT || 4000 })
  .then(({ url }: { url: string }) => {
    console.log(`🚀  Server ready at ${url}`);
  });