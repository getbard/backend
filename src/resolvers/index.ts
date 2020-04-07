import { IResolvers, ResolversObject } from '../generated/graphql';
import merge from 'lodash.merge';

import articles from './articles';
import follows from './follows';
import stripe from './stripe';
import subscriptions from './subscriptions';
import users from './users';
import unsplashPhotos from './unsplashPhotos';

const resolvers: IResolvers = merge(
  articles,
  follows,
  stripe,
  subscriptions,
  users,
  unsplashPhotos,
) as ResolversObject<any>;

export default resolvers;
