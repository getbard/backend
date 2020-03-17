import './lib/env';

import { ApolloServer, gql } from 'apollo-server';
import { readFileSync } from 'fs';
import firebase from 'firebase-admin';
import fs from 'fs';

import db from './lib/db';
const firebaseConfig = JSON.parse(fs.readFileSync(`${__dirname}/../firebase.json`, 'utf8'));

import { Context } from './types';

import resolvers from './resolvers';

firebase.initializeApp({
  credential: firebase.credential.cert(firebaseConfig),
  databaseURL: "https://bard-stage.firebaseio.com"
});

const server = new ApolloServer({
  typeDefs: gql`${readFileSync(__dirname.concat('/schema.graphql'), 'utf8')}`,
  resolvers,
  context: async ({ req }): Promise<Context> => {
    const token = req.headers.authorization || '';
    let decodedToken;
    if (token) {
      decodedToken = await firebase.auth().verifyIdToken(token.split(' ')[1]);
    }

    return {
      db,
      userId: decodedToken?.uid || null,
    };
  }
});

server
  .listen({ port: process.env.PORT || 4000 })
  .then(({ url }: { url: string }) => {
    console.log(`🚀  Server ready at ${url}`);
  });