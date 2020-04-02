import { AuthenticationError, UserInputError } from 'apollo-server';
import cuid from 'cuid';
import Stripe from 'stripe';

import { Context } from '../types';
import {
  User,
  StripePlan,
  CreateUserInput,
  CreateUserPayload,
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

const stripePlan = async (
  parent: User,
  _: null,
  context: Context,
): Promise<StripePlan | null> => {
  const stripeUser = await getUserById(parent.id, context);

  if (!stripeUser) {
    throw new UserInputError('User not found');
  }

  if (!stripeUser?.stripePlanId || !stripeUser?.stripeUserId) {
    return null;
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2020-03-02',
    typescript: true,
  });

  const plan: Stripe.Plan = await stripe.plans.retrieve(stripeUser.stripePlanId, undefined, {
    stripeAccount: stripeUser.stripeUserId || undefined,
  });

  return {
    id: plan.id,
    currency: plan.currency,
    amount: plan.amount,
    interval: plan.interval,
  };
}

export default {
  Query: {
    me,
    user,
  },
  Mutation: {
    createUser,
  },
  User: {
    stripePlan,
  }
}