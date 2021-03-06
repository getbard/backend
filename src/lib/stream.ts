import stream from 'getstream';
import * as Sentry from '@sentry/node';

import { Context, Activity } from '../types';

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
    // limit: 0 makes sure no feed history is copied
    // eslint-disable-next-line @typescript-eslint/camelcase
    currUserFeed.follow(resourceType, resourceId);
  } catch (error) {
    console.error(`Failed to follow ${resourceType} feed:`, error?.detail || error, {
      resource: resourceId,
      user: context.userId,
    });
    Sentry.captureException(error);
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
    Sentry.captureException(error);
  }
}

export const addActivity = ({
  context,
  verb,
  objectType,
  objectId,
  to = [],
  custom = {},
}: Activity): void => {
  if (!context.userId) {
    console.error(`Failed to add activity ${verb}, user context not found`);
    return;
  }

  let activity = {
    actor: context.userId,
    verb,
    object: `${objectType}:${objectId}`,
    to: to || [],
    // eslint-disable-next-line @typescript-eslint/camelcase
    foreign_id: `${verb}:${objectId}`,
    time: new Date().toISOString(),
  };

  if (custom) {
    activity = {
      ...activity,
      ...custom,
    }
  }

  try {
    const currUserFeed = context.stream.feed('user', context.userId);
    currUserFeed.addActivity(activity);
  } catch (error) {
    console.error(`Failed to add activity ${verb} feed:`, error?.detail || error, activity);
    Sentry.captureException(error);
  }
}

export const removeActivity = ({
  context,
  verb,
  objectId,
}: {
  context: Context;
  verb: string;
  objectId: string;
}): void => {
  if (!context.userId) {
    console.error(`Failed to add activity ${verb}, user context not found`);
    return;
  }

  const foreignId = `${verb}:${objectId}`;

  try {
    const currUserFeed = context.stream.feed('user', context.userId);
    currUserFeed.removeActivity({ foreignId });
  } catch (error) {
    console.error(`Failed to add activity ${verb} feed:`, error?.detail || error, foreignId);
    Sentry.captureException(error);
  }
}

export default client as stream.StreamClient;