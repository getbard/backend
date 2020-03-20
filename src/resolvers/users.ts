
import { AuthenticationError } from 'apollo-server';

import { Context } from '../types';
import { User, CreateUserInput, CreateUserPayload } from '../generated/graphql';

const me = async (
  _: null,
  args: { id: string },
  context: Context
): Promise<User | null> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  if (context?.userId !== args.id) {
    throw new AuthenticationError('Not authorized');
  }

  const userDoc = await context.db.doc(`users/${args.id}`).get();
  const user = userDoc.data() as User | undefined;
  return user ? { id: userDoc.id, ...user } : null;
}

const createUser = async (
  _: null,
  { input }: { input: CreateUserInput },
  context: Context
): Promise<CreateUserPayload> => {
  const userRef = await context.db.collection('users').add(input);
  const userDoc = await context.db.doc(`articles/${userRef.id}`).get();
  return { id: userDoc.id, ...userDoc.data() } as CreateUserPayload;
}

export default {
  Query: {
    me,
  },
  Mutation: {
    createUser,
  }
}