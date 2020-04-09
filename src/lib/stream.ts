import stream from 'getstream';

import { Context } from '../types';
import { messaging } from 'firebase-admin';

let client;

if (process.env.STREAM_API_KEY && process.env.STREAM_API_SECRET && process.env.STREAM_APP_ID) {
  client = stream.connect(
    process.env.STREAM_API_KEY,
    process.env.STREAM_API_SECRET,
    process.env.STREAM_APP_ID,
  );
} else {
  console.warn('Could not initialize stream, env parameters are missing!');
}

export const followStream = (
  context: Context,
  resourceType: string,
  resourceId: string,
): void => {
  if (!context.userId) {
    console.error(`Failed to follow ${resourceType} feed, user context not found`);
    return;
  }

  try {
    const currUserFeed = context.stream.feed('timeline', context.userId);
    currUserFeed.follow(resourceType, resourceId);
  } catch (error) {
    console.error(`Failed to follow ${resourceType} feed:`, error?.detail || error, {
      resource: resourceId,
      user: context.userId,
    });
  }
}

export const unfollowStream = (
  context: Context,
  resourceType: string,
  resourceId: string,
): void => {
  if (!context.userId) {
    console.error(`Failed to unfollow ${resourceType} feed, user context not found`);
    return;
  }

  try {
    const currUserFeed = context.stream.feed('timeline', context.userId);
    currUserFeed.unfollow(resourceType, resourceId);
  } catch (error) {
    console.error(`Failed to unfollow ${resourceType} feed:`, error?.detail || error, {
      resource: resourceId,
      user: context.userId,
    });
  }
}

export const addActivity = (
  context: Context,
  verb: string,
  object: string,
  to?: string[],
): void => {
  if (!context.userId) {
    console.error(`Failed to add activity ${verb}, user context not found`);
    return;
  }

  const activity = {
    actor: context.userId,
    verb,
    object,
    to: to || [],
    // eslint-disable-next-line @typescript-eslint/camelcase
    foreign_id: `${verb}:${object}`,
    time: new Date().toISOString(),
  };

  if (verb === 'article') {
    activity.to = [...activity.to, `${verb}:${object}`];
  }

  try {
    const currUserFeed = context.stream.feed('user', context.userId);
    currUserFeed.addActivity(activity);
  } catch (error) {
    console.error(`Failed to add activity ${verb} feed:`, error?.detail || error, activity);
  }
}

export default client as stream.StreamClient;