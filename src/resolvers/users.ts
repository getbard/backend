
import { AuthenticationError } from 'apollo-server';
import cuid from 'cuid';

import { Context } from '../types';
import { User, CreateUserInput, CreateUserPayload } from '../generated/graphql';

const createUsername = (name: string): string => {
  return `${name.toLowerCase()}${cuid.slug()}`;
}

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
  const fullname = input.lastName ? `${input.firstName}${input.lastName[0]}` : input.firstName;
  const username = createUsername(fullname);

  const userRef = await context.db.collection('users').add({
    ...input,
    username,
  });

  const userDoc = await context.db.doc(`users/${userRef.id}`).get();
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