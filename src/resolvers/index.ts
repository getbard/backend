import { IResolvers, ResolversObject } from '../generated/graphql';
import merge from 'lodash.merge';

import articles from './articles';
import auth from './auth';
import comments from './comments';
import feeds from './feeds';
import follows from './follows';
import images from './images';
import stripe from './stripe';
import subscriptions from './subscriptions';
import users from './users';
import unsplashPhotos from './unsplashPhotos';

const resolvers: IResolvers = merge(
  articles,
  auth,
  comments,
  feeds,
  follows,
  images,
  stripe,
  subscriptions,
  users,
  unsplashPhotos,
) as ResolversObject<any>;

export default resolvers;
