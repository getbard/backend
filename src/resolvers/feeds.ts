import { AuthenticationError } from 'apollo-server';

import { Context } from '../types';
import { Feed, ProfileFeed } from './../generated/graphql';

import { getUserById } from './users';
import { comment } from './comments';
import { article } from './articles';

const feed = async (
  _: null,
  args: null,
  context: Context,
): Promise<Feed> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  const timeline = context.stream.feed('timeline', context.userId);
  const feed = await timeline.get({ limit: 20 }) as any;

  // Loop through activities and resolve them
  // Gross algorithm but we limit it
  // to 20 results at a time
  for (let i = 0; i < feed.results.length; i++) {
    const result = feed.results[i];

    for (let j = 0; j < result.activities.length; j++) {
      const activity = result.activities[j];
      const userIsActor = activity.actor === context.userId;

      // Remove the user's own activities because they
      // surely don't need to be notified of them
      if (userIsActor) {
        // eslint-disable-next-line @typescript-eslint/camelcase
        result.actor_count -= 1;

        // If the user was the only actor
        // we need to remove the result
        if (result.actor_count === 0) {
          feed.results[i] = null;
        } else {
          result.activities[j] = null;
        }

        continue;
      }

      const { object } = activity;
      const [type, id] = object.split(':');

      activity.actor = await getUserById(activity.actor, context);

      switch (type) {
        case 'comment':
          activity.object = await comment(null, { id }, context);
          break;
        case 'article':
          activity.object = await article(null, { id }, context);
          break
        case 'follow':
        case 'subscription':
          activity.object = await getUserById(id, context);
          break;
        default:
          activity.object = null;
      }
    }

    // Filter out any off the user's activities (which got nulled)
    if (feed?.results[i]?.activities) {
      feed.results[i].activities = feed.results[i].activities.filter(Boolean);
    }
  }

  // Filter out any results that got nulled
  feed.results = feed.results.filter(Boolean);

  return feed as Feed;
}

const profileFeed = async (
  _: null,
  args: { userId: string },
  context: Context,
): Promise<ProfileFeed> => {
  const timeline = context.stream.feed('user', args.userId);
  const feed = await timeline.get({ limit: 20 }) as any;

  // Loop through results and resolve them
  for (let i = 0; i < feed.results.length; i++) {
    const result = feed.results[i];

    const { object } = result;
    const [type, id] = object.split(':');

    result.actor = await getUserById(result.actor, context);

    switch (type) {
      case 'comment':
        result.object = await comment(null, { id }, context);
        break;
      case 'article':
        result.object = await article(null, { id }, context);
        break
      case 'follow':
      case 'subscription':
        result.object = await getUserById(id, context);
        break;
      default:
        result.object = null;
    }
  }
  
  return feed as ProfileFeed;
}

export default {
  Query: {
    feed,
    profileFeed,
  },
  FeedActivityObject: {
    __resolveType(obj: any): string | null {
      if (obj.title) {
        return 'Article';
      }

      if (obj.message) {
        return 'Comment';
      }

      if (obj.username) {
        return 'User';
      }

      return null;
    },
  },
};
