import { AuthenticationError, UserInputError } from 'apollo-server';
import cuid from 'cuid';
import Stripe from 'stripe';

import { getSubscriptionWithStripeData } from './subscriptions';

import { Context } from '../types';
import {
  User,
  StripePlan,
  Subscription,
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

export const getUserByStripeId = async (stripeUserId: string, context: Context): Promise<User | null> => {
  const users = await context.db.collection('users').where('stripeUserId', '==', stripeUserId).get();
  const usersWithData = users.docs.map(user => ({ id: user.id, ...user.data() })) as User[];
  const user = usersWithData[0];
  return user || null;
}

const user = async (
  _: null,
  args: { username: string },
  context: Context
): Promise<User> => {
  let user;
  if (args.username === 'me') {
    if (!context.userId) {
      throw new AuthenticationError('Not authenticated');
    }

    user = await getUserById(context.userId, context);
  } else {
    const users = await context.db.collection('users').where('username', '==', args.username).get();
    const usersWithData = users.docs.map(user => ({ id: user.id, ...user.data() })) as User[];
    user = usersWithData[0];
  }

  if (!user) {
    throw new UserInputError('User not found');
  }

  return user;
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

const subscriptions = async (
  parent: User,
  _: null,
  context: Context,
): Promise<Promise<Subscription | null>[]> => {
  const user = await getUserById(parent.id, context);

  if (!user) {
    throw new UserInputError('User not found');
  }

  const subscriptions = await context.db
    .collection('subscriptions')
    .where('userId', '==', user.id)
    .where('deletedAt', '==', null)
    .get();

  return subscriptions.docs
    .map(async (subDoc): Promise<Subscription | null> => {
      let subscription = {
        id: subDoc.id,
        ...subDoc.data()
      } as Subscription;
      
      subscription = await getSubscriptionWithStripeData(subscription, context);

      return subscription;
    });
}

const subscribers = async (
  parent: User,
  _: null,
  context: Context,
): Promise<Promise<string>[]> => {
  const user = await getUserById(parent.id, context);

  if (!user) {
    throw new UserInputError('User not found');
  }

  const subscriptions = await context.db
    .collection('subscriptions')
    .where('authorId', '==', user.id)
    .where('deletedAt', '==', null)
    .get();

  return subscriptions.docs
    .map(async (subDoc): Promise<string> => {
      const subscription = {
        id: subDoc.id,
        ...subDoc.data()
      } as Subscription;
      
      return subscription.userId;
    });
}

export default {
  Query: {
    user,
  },
  Mutation: {
    createUser,
  },
  User: {
    stripePlan,
    subscriptions,
    subscribers,
  }
}