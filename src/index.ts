import { ApolloServer, gql } from 'apollo-server';

const typeDefs = gql`
  type Article {
    title: String
    author: String
  }

  type Query {
    articles: [Article]
  }
`;

const articles = [
  {
    title: 'How to make a living with your writing',
    author: 'Anthony Morris',
  },
  {
    title: 'Finding Success After Bootcamp',
    author: 'Anthony Morris',
  },
];

const resolvers = {
  Query: {
    articles: (): Array<object> => articles,
  },
};

const server = new ApolloServer({ typeDefs, resolvers });

server.listen({ port: process.env.PORT || 4000 }).then(({ url }: { url: string }) => {
  console.log(`🚀  Server ready at ${url}`);
});