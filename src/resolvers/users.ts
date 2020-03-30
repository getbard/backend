import { AuthenticationError } from 'apollo-server';
import cuid from 'cuid';
import Stripe from 'stripe';

import { Context } from '../types';
import {
  User,
  CreateUserInput,
  CreateUserPayload,
  ConnectStripeAccountInput,
  ConnectStripeAccountPayload,
} from '../generated/graphql';

const createUsername = (name: string): string => {
  return `${name.toLowerCase()}${cuid.slug()}`;
}

export const getUserById = async (id: string, context: Context): Promise<User | null> => {
  const userDoc = await context.db.doc(`users/${id}`).get();
  const user = userDoc.data() as User | undefined;
  return user ? { id: userDoc.id, ...user } : null;
}

const me = async (
  _: null,
  args: { id: string },
  context: Context
): Promise<User | null> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  return await getUserById(context.userId, context);
}

const user = async (
  _: null,
  args: { username: string },
  context: Context
): Promise<User | null> => {
  const users = await context.db.collection('users').where('username', '==', args.username).get();
  const usersWithData = users.docs.map(user => ({ id: user.id, ...user.data() })) as User[];
  return usersWithData[0] || null;
}

const createUser = async (
  _: null,
  { input }: { input: CreateUserInput },
  context: Context
): Promise<CreateUserPayload> => {
  const fullname = input.lastName ? `${input.firstName}${input.lastName[0]}` : input.firstName;
  const username = createUsername(fullname);

  await context.db.doc(`users/${input.id}`).set({
    ...input,
    username,
    createdAt: new Date().toISOString(),
  });

  const userDoc = await context.db.doc(`users/${input.id}`).get();
  return { id: userDoc.id, ...userDoc.data() } as CreateUserPayload;
}

const connectStripeAccount = async (
  _: null,
  { input }: { input: ConnectStripeAccountInput },
  context: Context,
): Promise<ConnectStripeAccountPayload> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  if (context?.userId !== input.userId) {
    throw new AuthenticationError('Not authorized');
  }

  const stripe = Stripe('sk_test_WtKVEJcgAEXUHjsfLqY3ZS9q00hmWOSqqA');

  const response = await stripe.oauth.token({
    // eslint-disable-next-line @typescript-eslint/camelcase
    grant_type: 'authorization_code',
    code: input.authCode,
  });

  const { stripe_user_id: stripeUserId, error } = response;

  if (error) {
    console.log('Failed to connect Stripe account:', error);
    return { success: false };
  }

  await context.db.doc(`users/${input.userId}`).set({
    stripeUserId,
  }, { merge: true });

  return { success: true };
}

export default {
  Query: {
    me,
    user,
  },
  Mutation: {
    createUser,
    connectStripeAccount,
  }
}