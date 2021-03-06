import { downloadUnsplashPhoto } from './unsplashPhotos';
import { AuthenticationError, UserInputError } from 'apollo-server';
import slugify from 'slugify';
import cuid from 'cuid';
import * as Sentry from '@sentry/node';

import { followStream, unfollowStream, addActivity, removeActivity } from './../lib/stream';
import { getUserById, subscribers } from './users';
import { getSubscriptionsByAuthorId } from './subscriptions';
import { sendEmail } from './email';
import { serializeHtml, lineBreakEliminator } from '../lib/slate';

import { Context } from '../types';
import {
  Article,
  ArticlesPayload,
  ArticleAnalytics,
  Comment,
  Subscription,
  User,
  CreateOrUpdateArticleInput,
  CreateOrUpdateArticlePayload,
  PublishArticleInput,
  DeleteArticleInput,
  AnalyticDetail,
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

  // Authors can already read their own article
  if (article.userId === context.userId) {
    return false;
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
  return article.subscribersOnly && !articleSubscribers.includes(context.userId || '');
}

const getArticleContent = (article: Article, contentBlocked: boolean): string => {
  if (contentBlocked) {
    // Remove all content except the first Slate node
    // Fallback to empty node for safety
    return JSON.stringify([JSON.parse(article.content || '[{"type":"paragraph","children":[{"text":""}]}]')[0]]);
  }

  return article.content || '';
}

const sendArticleToSubscribers = async (article: Article, context: Context): Promise<void> => {
  const author = await getUserById(article.userId, context);

  if (!author) {
    console.error(`Could not email article (${article.id}), user not found: ${article.userId}`);
    return;
  }

  try {
    const authorSubscriptions = await getSubscriptionsByAuthorId(author.id, context);
    const authorName = `${author.firstName}${author?.lastName && ' ' + author.lastName}`;
    const authorLink = `<a href="https://getbard.com/${author?.username}">${authorName}</a>`;
    const articleLink = `If you prefer, <a href="https://getbard.com/articles/s/${article.slug}">you can read the article on Bard's platform</a>.`;
    const authorSupportLink = `<a href="https://getbard.com/${author?.username}?support=true">consider supporting ${authorName} on Bard</a>`;
    const subscribeButton = `<a href="https://getbard.com/${author?.username}?support=true" style="margin: 0 auto;text-align:center;background:#004346;color:white;padding:20px;border-radius:0.125rem;">Support ${authorName} on Bard</a><br/>`;
  
    const personalizations = [];

    for (let i = 0; i < authorSubscriptions.length; i++) {
      const subscription = await authorSubscriptions[i] as Subscription;
  
      if (subscription.status === 'active') {
        const subscriber = await getUserById(subscription.userId, context);
        const subscriberName = `${subscriber?.firstName} ${subscriber?.lastName}`;
  
        personalizations.push({
          to: [{
            name: subscriberName,
            email:subscriber?.email,
          }],
          // eslint-disable-next-line @typescript-eslint/camelcase
          dynamic_template_data: {
            subject: article.title,
            name: subscriberName,
            authorName,
            authorLink,
            articleLink,
            authorSupportLink,
            subscribeButton,
            article: `
              ${article?.headerImage ? '<img style="width:100%;" src="' + article.headerImage?.url + '" />' : ''}
              ${article?.headerImage ? '<span style="margin: 0 auto;width:100%;text-align:center;font-size:.75rem;">Photo by <a href="' + article.headerImage?.photographerUrl + '?utm_source=bard&utm_medium=referral">' + article.headerImage?.photographerName + '</a> on <a href="https://unsplash.com?utm_source=bard&utm_medium=referral">Unsplash</a></span><br/>' : ''}
              <h1>${article.title}</h1>
              ${article?.summary ? '<h2>' + article.summary + '</h2>' : ''}
              ${serializeHtml({ children: JSON.parse(article.content || '[]') })}
            `,
          },
        })
      }
    }

    if (personalizations.length) {
      sendEmail({
        personalizations,
        from: {
          name: `${authorName} on Bard`,
          email: 'noreply@getbard.com',
        },
        subject: article.title,
        html: '<span></span>',
        templateId: 'd-a4cbe9a9737f41d8b96c8853eb6d49b8',
        // eslint-disable-next-line @typescript-eslint/camelcase
        asm: { group_id: 16911 },
      });
    }
  } catch (error) {
    console.error('Failed to send email to subscribers:', error);
    Sentry.captureException(error);
  }
}

const articles = async (
  _: null, 
  args: {
    category: string;
    cursor: string;
  },
  context: Context
): Promise<ArticlesPayload> => {
  let articles;
  const category = args?.category
    ? args.category.toLowerCase()
    : 'all';

  if (category === 'all') {
    articles = await context.db
      .collection('articles')
      .where('publishedAt', '>', '')
      .where('deletedAt', '==', null)
      .orderBy('publishedAt', 'desc')
      .orderBy('updatedAt', 'desc');
  } else {
    articles = await context.db
      .collection('articles')
      .where('category', '==', category)
      .where('publishedAt', '>', '')
      .where('deletedAt', '==', null)
      .orderBy('publishedAt', 'desc')
      .orderBy('updatedAt', 'desc');
  }

  if (args?.cursor) {
    const lastArticle = await context.db.doc(`articles/${args.cursor}`).get();

    articles = await articles
      .startAfter(lastArticle)
      .limit(12)
      .get();
  } else {
    articles = await articles.limit(12).get();
  }

  const articlesData = articles.docs.map(article => ({
    id: article.id,
    ...article.data(),
  })) as Article[];

  return {
    articles: articlesData,
    cursor: articlesData.length
      ? articlesData[articlesData.length - 1].id
      : null,
  };
};

export const article = async (
  _: null,
  args: { id: string },
  context: Context
): Promise<Article | null> => {
  const articleDoc = await context.db.doc(`articles/${args.id}`).get();
  const article = articleDoc.data() as Article | undefined;
  const contentBlocked = await shouldBlockContent(article, context);

  if (!article) {
    throw new UserInputError('Article not found');
  }

  return {
    ...article,
    id: articleDoc.id,
    content: getArticleContent(article, contentBlocked),
    contentBlocked,
  };
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

  const articleDoc = articles.docs[0];
  
  if (!articleDoc) {
    throw new UserInputError('Article not found');
  }

  const article = articles.docs[0].data() as Article;

  const contentBlocked = await shouldBlockContent(article, context);

  return {
    ...article,
    id: articleDoc.id,
    content: getArticleContent(article, contentBlocked),
    contentBlocked,
  };
}

export const articlesByUser = async (
  _: null, 
  {
    userId,
    drafts,
    limit = 100,
  }: {
    userId: string;
    drafts: boolean;
    limit: number;
  },
  context: Context
): Promise<Article[]> => {
  const articlesRef = await context.db.collection('articles');
  let articles;

  // Filter out drafts if the requesting user isn't the author
  if (context.userId === userId) {
    articles = await articlesRef
      .where('userId', '==', userId)
      .where('deletedAt', '==', null)
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get();

    // Filter out user drafts if they weren't explicitely requested
    // @TODO: Move this into a different request?
    if (!drafts) {
      return articles.docs.filter(article => {
        const articleData = article.data();
        return articleData.publishedAt;
      }).map(article => ({ id: article.id, ...article.data() })) as Article[];
    }
  } else {
    articles = await articlesRef
      .where('userId', '==', userId)
      .where('publishedAt', '>', '')
      .where('deletedAt', '==', null)
      .orderBy('publishedAt', 'desc')
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get();
  }

  return articles.docs.map(article => ({ id: article.id, ...article.data() })) as Article[];
};

const freeArticlesByUser = async (
  _: null, 
  {
    userId,
    limit = 3,
  }: {
    userId: string;
    limit: number;
  },
  context: Context
): Promise<Article[]> => {
  const articlesRef = await context.db.collection('articles');

  const articles = await articlesRef
    .where('userId', '==', userId)
    .where('publishedAt', '>', '')
    .where('deletedAt', '==', null)
    .where('subscribersOnly', '==', false)
    .orderBy('publishedAt', 'desc')
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get();

  return articles.docs.map(article => ({ id: article.id, ...article.data() })) as Article[];
};

const createArticle = async (
  _: null,
  { input }: { input: CreateOrUpdateArticleInput },
  context: Context
): Promise<CreateOrUpdateArticlePayload> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
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

  if (article.title && article.title.length > 80) {
    article.title = article.title.substring(0, 80);  
  }

  if (article.summary && article.summary.length > 280) {
    article.summary = article.summary.substring(0, 280);
  }

  // Send the download event to Unsplash
  if (input.headerImage && input?.headerImage?.downloadUrl) {
    downloadUnsplashPhoto(input.headerImage.downloadUrl);
  }

  // Make sure the ID doesn't exist
  delete article.id;

  const articleRef = await context.db.collection('articles').add(article);
  const articleDoc = await context.db.doc(`articles/${articleRef.id}`).get();

  return { id: articleDoc.id } as CreateOrUpdateArticlePayload;
}

const updateArticle = async (
  _: null,
  { input }: { input: CreateOrUpdateArticleInput },
  context: Context
): Promise<CreateOrUpdateArticlePayload> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  const articleDoc = await context.db.doc(`articles/${input.id}`).get();
  const oldArticle = { ...articleDoc.data() };

  if (context.userId !== oldArticle.userId) {
    throw new AuthenticationError('Not authorized');
  }

  const article: CreateOrUpdateArticleInput = {
    ...input,
    updatedAt: new Date().toISOString(),
  };

  if (article.title && article.title.length > 80) {
    article.title = article.title.substring(0, 80);  
  }

  if (article.summary && article.summary.length > 280) {
    article.summary = article.summary.substring(0, 280);
  }

  // Send the download event to Unsplash
  if (input.headerImage && oldArticle?.headerImage?.url !== input.headerImage.url && input?.headerImage?.downloadUrl) {
    downloadUnsplashPhoto(input?.headerImage?.downloadUrl || '');
  }

  await context.db.doc(`articles/${article.id}`).set(article, { merge: true });

  return { id: articleDoc.id } as CreateOrUpdateArticlePayload;
}

const publishArticle = async (
  _: null,
  { input }: { input: PublishArticleInput },
  context: Context
): Promise<Article> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  const firebaseUser = await context.firebase.auth().getUser(context.userId);
  if (!firebaseUser?.emailVerified) {
    throw new AuthenticationError('Email not verified');
  }

  const articleDoc = await context.db.doc(`articles/${input.id}`).get();
  const article = { id: articleDoc.id, ...articleDoc.data() } as Article;

  if (!article) {
    throw new UserInputError('Article not found');
  }

  if (context.userId !== article.userId) {
    throw new AuthenticationError('Not authorized');
  }

  let updatedArticle;

  if (!article.title || (input.article && !input.article.title)) {
    throw new UserInputError('Article must have a title');
  }

  if (!article.content || (input.article && !input.article.content)) {
    throw new UserInputError('Article must have content');
  }

  if (article.publishedAt) {
    updatedArticle = {
      ...article,
      ...input.article,
      updatedAt: new Date().toISOString(),
    } as Article;
  } else {
    updatedArticle = {
      ...article,
      publishedAt: new Date().toISOString(),
      slug: createArticleSlug(article.title),
    } as Article;
  }

  if (updatedArticle.title.length > 80) {
    updatedArticle.title = updatedArticle.title.substring(0, 80);  
  }

  if (updatedArticle.summary && updatedArticle.summary.length > 200) {
    updatedArticle.summary = updatedArticle.summary.substring(0, 200);
  }

  // The article has content because it is checked above
  // Eliminate all consecutive line breaks so we don't have
  // crappy looking content
  updatedArticle.content = JSON.stringify(lineBreakEliminator(JSON.parse(updatedArticle.content!)));

  await context.db
    .doc(`articles/${article.id}`)
    .set(updatedArticle, { merge: true });

  // Only call stream on first publish
  if (!article.publishedAt) {
    followStream(context, 'article', article.id);

    addActivity({
      context,
      verb: 'published',
      objectType: 'article',
      objectId: article.id,
    });

    sendArticleToSubscribers(updatedArticle, context);
  }

  return updatedArticle;
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

  if (context.userId !== article.userId) {
    throw new AuthenticationError('Not authorized');
  }

  const deleted = {
    ...article,
    deletedAt: new Date().toISOString()
  };

  await context.db
    .doc(`articles/${article.id}`)
    .set(deleted, { merge: true });

    
  if (article.publishedAt) {
    unfollowStream(context, 'article', article.id);

    removeActivity({
      context,
      verb: 'published',
      objectId: article.id,
    });
  }

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
    .orderBy('createdAt', 'asc')
    .get();

  return comments.docs.map(comment => ({ id: comment.id, ...comment.data() })) as Comment[];
}

const analytics = async (
  parent: Article,
  _: null,
  context: Context,
): Promise<ArticleAnalytics> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  if (context.userId !== parent.userId) {
    throw new AuthenticationError('Not authorized');
  }

  const totalComments = await comments(parent, null, context);

  if (!context.bigQuery) {
    return {
      totalViews: 0,
      totalReads: 0,
      totalComments: totalComments.length,
      views: [],
      reads: [],
      wordCount: parent.wordCount,
    };
  }

  const table = process.env.NODE_ENV === 'production' ? 'bard-prod.webapp_production' : 'bard-stage.webapp'

  const viewQuery = `
    SELECT
      article_id,
        FORMAT_DATE("%Y-%m-%d", CAST(timestamp as date)) as date,
      COUNT(article_id) as count
    FROM \`${table}.article_article_viewed\`
    WHERE \`${table}.article_article_viewed\`.article_id = '${parent.id}'
    GROUP BY article_id, date
  `;

  const [viewJob] = await context.bigQuery.createQueryJob({ query: viewQuery });
  const [viewResults] = await viewJob.getQueryResults();
  const totalViews = viewResults.reduce((a, b) => a + b.count, 0);

  const readQuery = `
    SELECT 
      article_id,
        FORMAT_DATE("%Y-%m-%d", CAST(timestamp as date)) as date,
      COUNT(article_id) as count
    FROM \`${table}.article_article_read\`
    WHERE \`${table}.article_article_read\`.article_id = '${parent.id}'
    GROUP BY article_id, date
  `;

  const [readJob] = await context.bigQuery.createQueryJob({ query: readQuery });
  const [readResults] = await readJob.getQueryResults();
  const totalReads = readResults.reduce((a, b) => a + b.count, 0);

  return {
    totalViews,
    totalReads,
    totalComments: totalComments.length,
    views: viewResults as AnalyticDetail[],
    reads: readResults as AnalyticDetail[],
    wordCount: parent.wordCount,
  };
}

export default {
  Query: {
    articles,
    article,
    articleBySlug,
    articlesByUser,
    freeArticlesByUser,
  },
  Mutation: {
    createArticle,
    updateArticle,
    publishArticle,
    deleteArticle,
  },
  Article: {
    author,
    comments,
    analytics,
  },
}
