import { ResolversObject } from './../generated/graphql';
import { AuthenticationError, UserInputError } from 'apollo-server';
import slugify from 'slugify';
import cuid from 'cuid';

import { getUserById } from './users';

import { Context } from '../types';
import {
  Article,
  CreateOrUpdateArticleInput,
  CreateOrUpdateArticlePayload,
  PublishArticleInput,
  User,
} from '../generated/graphql';

const createArticleSlug = (articleTitle: string): string => {
  return `${slugify(articleTitle.toLowerCase())}-${cuid.slug()}`;
}

const articles = async (
  _: null, 
  args: null,
  context: Context
): Promise<Article[]> => {
  const articles = await context.db
    .collection('articles')
    .where('draft', '==', false)
    .orderBy('updatedAt', 'desc')
    .get();

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

const articleBySlug = async (
  _: null,
  args: { slug: string },
  context: Context
): Promise<Article | null> => {
  const articles = await context.db
    .collection('articles')
    .where('slug', '==', args.slug)
    .get();

  const article = articles.docs[0].data() as Article | undefined;
  return article ? { id: articles.docs[0].id, ...article } : null;
}

const articlesByUser = async (
  _: null, 
  args: {
    userId: string;
    drafts: boolean;
  },
  context: Context
): Promise<Article[]> => {
  const articlesRef = await context.db.collection('articles');
  let articles;

  // Filter out drafts if the requesting user isn't the author
  if (context.userId === args.userId) {
    articles = await articlesRef
      .where('userId', '==', args.userId)
      .orderBy('updatedAt', 'desc')
      .get();
    
    // Filter out user drafts if they weren't explicitely requested
    // @TODO: Move this into a different request?
    if (!args.drafts) {
      return articles.docs.filter(article => {
        const articleData = article.data();
        return articleData.draft === false;
      }).map(article => ({ id: article.id, ...article.data() })) as Article[];
    }
  } else {
    articles = await articlesRef
      .where('userId', '==', args.userId)
      .where('draft', '==', false)
      .orderBy('updatedAt', 'desc')
      .get();
  }

  return articles.docs.map(article => ({ id: article.id, ...article.data() })) as Article[];
};

const createOrUpdateArticle = async (
  _: null,
  { input }: { input: CreateOrUpdateArticleInput },
  context: Context
): Promise<CreateOrUpdateArticlePayload> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  if (input.userId && context?.userId !== input.userId) {
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
    // Default values for new articles
    article.draft = true;
    article.createdAt = new Date().toISOString();
    article.userId = context.userId;

    const articleRef = await context.db.collection('articles').add(article);
    articleDoc = await context.db.doc(`articles/${articleRef.id}`).get();
  }
  
  return { id: articleDoc.id, ...articleDoc.data() } as CreateOrUpdateArticlePayload;
}

const publishArticle = async (
  _: null,
  { input }: { input: PublishArticleInput },
  context: Context
): Promise<Article> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  const articleDoc = await context.db.doc(`articles/${input.id}`).get();
  const article = { id: articleDoc.id, ...articleDoc.data() } as Article;

  if (!article) {
    throw new UserInputError('Article not found');
  }

  if (context?.userId !== article.userId) {
    throw new AuthenticationError('Not authorized');
  }

  let updatedArticle;

  if (!article.draft) {
    updatedArticle = {
      ...article,
      ...input.article,
      updatedAt: new Date().toISOString(),
    }
  } else {
    updatedArticle = {
      ...article,
      publishedAt: new Date().toISOString(),
      draft: false,
      slug: createArticleSlug(article.title),
    }
  }

  await context.db
    .doc(`articles/${article.id}`)
    .set(updatedArticle, { merge: true });

  return updatedArticle as Article;
}

const articleAuthor = async (
  parent: Article,
  _: null,
  context: Context,
): Promise<User | null> => {
  return await getUserById(parent.userId, context);
}

export default {
  Query: {
    articles,
    article,
    articleBySlug,
    articlesByUser,
  },
  Mutation: {
    createOrUpdateArticle,
    publishArticle,
  },
  Article: {
    author: articleAuthor,
  },
}
