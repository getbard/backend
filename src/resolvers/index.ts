import { IResolvers } from '../generated/graphql';
import merge from 'lodash.merge';

import articles from './articles';

const resolvers: IResolvers = merge(articles);

export default resolvers;