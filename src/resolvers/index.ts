import { IResolvers } from '../generated/graphql';
import merge from 'lodash.merge';

import articles from './articles';
import users from './users';

// @TODO: Resolve this issue!
// eslint-disable-next-line @typescript-eslint/ban-ts-ignore
// @ts-ignore
const resolvers: IResolvers = merge(articles, users);

export default resolvers;
