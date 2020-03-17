import { Article, CreateOrUpdateArticleInput, CreateOrUpdateArticlePayload } from '../generated/graphql';
import { Context } from '../types';
import { AuthenticationError } from 'apollo-server';

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

const createOrUpdateArticle = async (
  _: null,
  { input }: { input: CreateOrUpdateArticleInput },
  context: Context
): Promise<CreateOrUpdateArticlePayload> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  if (context.userId !== input.userId) {
    throw new AuthenticationError('Not authorized');
  }

  const article: CreateOrUpdateArticleInput = {
    ...input,
    updatedAt: new Date().toISOString(),
  };
  let articleDoc;

  if (article.id) {
    await context.db.doc(`articles/${article.id}`).set(article, { merge: true });
    articleDoc = await context.db.doc(`articles/${article.id}`).get();
  } else {
    article.createdAt = new Date().toISOString();
    const articleRef = await context.db.collection('articles').add(article);
    articleDoc = await context.db.doc(`articles/${articleRef.id}`).get();
  }
  
  return { id: articleDoc.id, ...articleDoc.data() } as CreateOrUpdateArticlePayload;
}

export default {
  Query: {
    articles,
    article,
  },
  Mutation: {
    createOrUpdateArticle,
  }
}