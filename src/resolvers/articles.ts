import { Context, Article } from '../types';

const articles = async (
  _: null, 
  args: null,
  context: Context
): Promise<Article[]> => {
  const articles = await context.db.collection('articles').get();
  return articles.docs.map(article => article.data()) as Article[];
};

const article = async (
  _: null,
  args: { id: string },
  context: Context
): Promise<Article | null> => {
  const articleDoc = await context.db.doc(`articles/${args.id}`).get();
  const article = articleDoc.data() as Article | undefined;

  return article || null;
}

const createArticle = async (
  _: null,
  { input }: { input: Article },
  context: Context
): Promise<Article> => {
  const articleRef = await context.db.collection('articles').add(input);
  const articleDoc = await context.db.doc(`articles/${articleRef.id}`).get();
  return articleDoc.data() as Article;
}

export default {
  Query: {
    articles,
    article,
  },
  Mutation: {
    createArticle,
  }
}