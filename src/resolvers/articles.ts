import { AuthenticationError, UserInputError } from 'apollo-server';
import slugify from 'slugify';
import cuid from 'cuid';

import { getUserById, subscribers } from './users';

import { Context } from '../types';
import {
  Article,
  Comment,
  User,
  CreateOrUpdateArticleInput,
  CreateOrUpdateArticlePayload,
  PublishArticleInput,
  DeleteArticleInput,
} from '../generated/graphql';

const createArticleSlug = (articleTitle: string): string => {
  return `${slugify(articleTitle.toLowerCase())}-${cuid.slug()}`;
}

const shouldBlockContent = async (article: Article | undefined, context: Context): Promise<boolean> => {
  if (!article) {
    return false
  }

  if (article.subscribersOnly && !context.userId) {
    return true;
  }

  const articleAuthor = await getUserById(article.userId, context);

  // Something is not right if we get here
  if (!articleAuthor) {
    return true;
  }

  const articleSubscribers = await subscribers(articleAuthor, null, context);
  if (article.subscribersOnly && !articleSubscribers.length) {
    return true;
  }
  return article.subscribersOnly && !articleSubscribers.includes(context.userId || '') && article.userId !== context.userId;
}

const getArticleContent = (article: Article, contentBlocked: boolean): string => {
  if (contentBlocked) {
    // Remove all content except the first Slate node
    // Fallback to empty node for safety
    return JSON.stringify([JSON.parse(article.content || '[{"type":"paragraph","children":[{"text":""}]}]')[0]]);
  }

  return article.content || '';
}

const articles = async (
  _: null, 
  args: { category: string },
  context: Context
): Promise<Article[]> => {
  let articles;
  const category = args.category.toLowerCase();

  if (category === 'all') {
    articles = await context.db
      .collection('articles')
      .where('publishedAt', '>', '')
      .where('deletedAt', '==', null)
      .orderBy('publishedAt', 'desc')
      .orderBy('updatedAt', 'desc')
      .get();
  } else {
    articles = await context.db
      .collection('articles')
      .where('category', '==', category)
      .where('publishedAt', '>', '')
      .where('deletedAt', '==', null)
      .orderBy('publishedAt', 'desc')
      .orderBy('updatedAt', 'desc')
      .get();
  }

  return articles.docs.map(article => ({ id: article.id, ...article.data() })) as Article[];
};

const article = async (
  _: null,
  args: { id: string },
  context: Context
): Promise<Article | null> => {
  const articleDoc = await context.db.doc(`articles/${args.id}`).get();
  const article = articleDoc.data() as Article | undefined;
  const contentBlocked = await shouldBlockContent(article, context);

  return article ? {
    id: articleDoc.id,
    ...article,
    content: getArticleContent(article, contentBlocked),
    contentBlocked,
  } : null;
}

const articleBySlug = async (
  _: null,
  args: { slug: string },
  context: Context
): Promise<Article | null> => {
  const articles = await context.db
    .collection('articles')
    .where('deletedAt', '==', null)
    .where('slug', '==', args.slug)
    .get();
  const article = articles.docs[0].data() as Article | undefined;
  const contentBlocked = await shouldBlockContent(article, context);

  return article ? {
    id: articles.docs[0].id,
    ...article,
    content: getArticleContent(article, contentBlocked),
    contentBlocked,
  } : null;
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
      .where('deletedAt', '==', null)
      .orderBy('updatedAt', 'desc')
      .get();

    // Filter out user drafts if they weren't explicitely requested
    // @TODO: Move this into a different request?
    if (!args.drafts) {
      return articles.docs.filter(article => {
        const articleData = article.data();
        return articleData.publishedAt;
      }).map(article => ({ id: article.id, ...article.data() })) as Article[];
    }
  } else {
    articles = await articlesRef
      .where('userId', '==', args.userId)
      .where('publishedAt', '>', '')
      .where('deletedAt', '==', null)
      .orderBy('publishedAt', 'desc')
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

  // TODO: Make this query the DB and check the user
  // instead of checking the input
  if (input.userId && context?.userId !== input.userId) {
    throw new AuthenticationError('Not authorized');
  }

  const defaultArticle = {
    userId: context.userId,
    title: '',
    summary: '',
    content: '',
    headerImage: null,
    slug: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: null,
    deletedAt: null,
    subscribersOnly: false,
    wordCount: 0,
    category: null,
  };

  const article: CreateOrUpdateArticleInput = {
    ...defaultArticle,
    ...input,
    updatedAt: new Date().toISOString(),
  };
  let articleDoc;

  if (article.id) {
    await context.db.doc(`articles/${article.id}`).set(article, { merge: true });
    articleDoc = await context.db.doc(`articles/${article.id}`).get();
  } else {
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

  if (article.publishedAt) {
    updatedArticle = {
      ...article,
      ...input.article,
      updatedAt: new Date().toISOString(),
    }
  } else {
    updatedArticle = {
      ...article,
      publishedAt: new Date().toISOString(),
      slug: createArticleSlug(article.title),
    }
  }

  await context.db
    .doc(`articles/${article.id}`)
    .set(updatedArticle, { merge: true });

  return updatedArticle as Article;
}

const deleteArticle = async (
  _: null,
  { input }: { input: DeleteArticleInput },
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

  const deleted = {
    ...article,
    deletedAt: new Date().toISOString()
  };

  await context.db
    .doc(`articles/${article.id}`)
    .set(deleted, { merge: true });

  return deleted as Article;
}

const author = async (
  parent: Article,
  _: null,
  context: Context,
): Promise<User | null> => {
  return await getUserById(parent.userId, context);
}

const comments = async (
  parent: Article,
  _: null,
  context: Context,
): Promise<Comment[]> => {
  const comments = await context.db
    .collection('comments')
    .where('resourceId','==', parent.id)
    .where('parentId', '==', null)
    .where('deletedAt', '==', null)
    .orderBy('createdAt', 'desc')
    .get();

  return comments.docs.map(comment => ({ id: comment.id, ...comment.data() })) as Comment[];
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
    deleteArticle,
  },
  Article: {
    author,
    comments,
  },
}
