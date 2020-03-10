const { ApolloServer, gql } = require('apollo-server');

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
    articles: () => articles,
  },
};

const server = new ApolloServer({ typeDefs, resolvers });
console.log('cool');


server.listen().then(({ url }: { url: string }) => {
  console.log(`🚀  Server ready at ${url}`);
});