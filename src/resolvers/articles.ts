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
  Comment,
  Subscription,
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
    const articleLink = `If you prefer, <a href="https://getbard.com/s/${article.slug}">you can read the article on Bard's platform</a>.`;
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
    headerCursor: string;
    headlessCursor: string;
  },
  context: Context
): Promise<ArticlesPayload> => {
  let articlesWithHeader;
  let articlesWithoutHeader;
  const category = args?.category
    ? args.category.toLowerCase()
    : 'all';

  if (category === 'all') {
    articlesWithHeader = await context.db
      .collection('articles')
      .where('publishedAt', '>', '')
      .where('deletedAt', '==', null)
      .orderBy('publishedAt', 'desc')
      .orderBy('headerImage.id')
      .orderBy('updatedAt', 'desc')

    articlesWithoutHeader = await context.db
      .collection('articles')
      .where('publishedAt', '>', '')
      .where('deletedAt', '==', null)
      .where('headerImage', '==', null)
      .orderBy('publishedAt', 'desc')
      .orderBy('updatedAt', 'desc')
  } else {
    articlesWithHeader = await context.db
      .collection('articles')
      .where('category', '==', category)
      .where('publishedAt', '>', '')
      .where('deletedAt', '==', null)
      .orderBy('publishedAt', 'desc')
      .orderBy('headerImage.id')
      .orderBy('updatedAt', 'desc')

    articlesWithoutHeader = await context.db
      .collection('articles')
      .where('category', '==', category)
      .where('publishedAt', '>', '')
      .where('deletedAt', '==', null)
      .where('headerImage', '==', null)
      .orderBy('publishedAt', 'desc')
      .orderBy('updatedAt', 'desc')
  }

  if (args?.headerCursor && args?.headlessCursor) {
    const lastHeaderArticle = await context.db.doc(`articles/${args.headerCursor}`).get();
    const lastHeadlessArticle = await context.db.doc(`articles/${args.headlessCursor}`).get();

    articlesWithoutHeader = await articlesWithoutHeader
      .startAfter(lastHeadlessArticle)
      .limit(12)
      .get();

    articlesWithHeader = await articlesWithHeader
      .startAfter(lastHeaderArticle)
      .limit(12)
      .get();
  } else {
    articlesWithoutHeader = await articlesWithoutHeader.limit(12).get();

    articlesWithHeader = await articlesWithHeader
      .limit(articlesWithoutHeader.docs.length <= 6 ? 14 : 12)
      .get();
  }

  const articlesWithHeaderData = articlesWithHeader.docs.map(article => ({
    id: article.id,
    ...article.data(),
  })) as Article[];

  const articlesWithoutHeaderData = articlesWithoutHeader.docs.map(article => ({
    id: article.id,
    ...article.data(),
  })) as Article[];

  return {
    articlesWithHeader: articlesWithHeaderData,
    articlesWithoutHeader: articlesWithoutHeaderData,
    headerCursor: articlesWithHeaderData.length
      ? articlesWithHeaderData[articlesWithHeaderData.length - 1].id
      : null,
    headlessCursor: articlesWithoutHeaderData.length
      ? articlesWithoutHeaderData[articlesWithoutHeaderData.length - 1].id
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
    id: articleDoc.id,
    ...article,
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
    id: articleDoc.id,
    ...article,
    content: getArticleContent(article, contentBlocked),
    contentBlocked,
  };
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

  // TODO: Make this query the DB and check the article user
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

  if (article.title && article.title.length > 80) {
    article.title = article.title.substring(0, 80);  
  }

  if (article.summary && article.summary.length > 280) {
    article.summary = article.summary.substring(0, 280);
  }

  if (article.id) {
    // Get the image before updating so we can send a download event to Unsplash
    articleDoc = await context.db.doc(`articles/${article.id}`).get();
    const oldArticle = { ...articleDoc.data() };

    // Send the download event to Unsplash
    if (input.headerImage && oldArticle?.headerImage?.url !== input.headerImage.url && input?.headerImage?.downloadUrl) {
      downloadUnsplashPhoto(input?.headerImage?.downloadUrl || '');
    }

    await context.db.doc(`articles/${article.id}`).set(article, { merge: true });
  } else {
    // Send the download event to Unsplash
    if (input.headerImage && input?.headerImage?.downloadUrl) {
      downloadUnsplashPhoto(input.headerImage.downloadUrl);
    }

    // Make sure the ID doesn't exist
    delete article.id;

    const articleRef = await context.db.collection('articles').add(article);
    articleDoc = await context.db.doc(`articles/${articleRef.id}`).get();
  }

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

  if (context?.userId !== article.userId) {
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
