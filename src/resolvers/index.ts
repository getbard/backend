import { IResolvers, ResolversObject } from '../generated/graphql';
import merge from 'lodash.merge';

import articles from './articles';
import stripe from './stripe';
import users from './users';
import unsplashPhotos from './unsplashPhotos';

const resolvers: IResolvers = merge(
  articles,
  stripe,
  users,
  unsplashPhotos,
) as ResolversObject<any>;

export default resolvers;
