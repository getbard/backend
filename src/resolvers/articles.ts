import { Article, CreateArticleInput, CreateArticlePayload } from '../generated/graphql';
import { Context } from '../types';

const articles = async (
  _: null, 
  args: null,
  context: Context
): Promise<Article[]> => {
  const articles = await context.db.collection('articles').get();
  return articles.docs.map(article => ({ id: article.id, ...article.data() })) as Article[];
};

const article = async (
  _: null,
  args: { id: string },
  context: Context
): Promise<Article | null> => {
  const articleDoc = await context.db.doc(`articles/${args.id}`).get();
  const article = articleDoc.data() as Article | undefined;
  return article ? { id: articleDoc.id, ...article } : null;
}

const createArticle = async (
  _: null,
  { input }: { input: CreateArticleInput },
  context: Context
): Promise<CreateArticlePayload> => {
  const articleRef = await context.db.collection('articles').add(input);
  const articleDoc = await context.db.doc(`articles/${articleRef.id}`).get();
  return { id: articleDoc.id, ...articleDoc.data() } as CreateArticlePayload;
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