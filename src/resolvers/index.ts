import { IResolvers, ResolversObject } from '../generated/graphql';
import merge from 'lodash.merge';

import articles from './articles';
import users from './users';

const resolvers: IResolvers = merge(articles, users) as ResolversObject<any>;

export default resolvers;
