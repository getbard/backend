import { AuthenticationError } from 'apollo-server';

import { Context } from '../types';
import { Feed } from './../generated/graphql';

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

  const userTimeline = context.stream.feed('timeline', context.userId);
  const feed = await userTimeline.get({ limit: 20 }) as any;

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
        result.activities[j] = null;
        continue;
      }

      const { object } = activity;
      const [type, id] = object.split(':');
  
      activity.actor = getUserById(activity.actor, context);
  
      switch (type) {
        case 'comment':
          activity.object = comment(null, { id }, context);
          break;
        case 'article':
          activity.object = article(null, { id }, context);
          break
        case 'follow':
        case 'subscription':
          activity.object = getUserById(id, context);
          break;
        default:
          activity.object = null;
      }
    }

    // Filter out any off the user's activities (which got nulled)
    feed.results[i].activities = feed.results[i].activities.filter(Boolean);
  }

  return feed as Feed;
}

export default {
  Query: {
    feed,
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
