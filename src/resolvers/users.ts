import { AuthenticationError, UserInputError } from 'apollo-server';
import cuid from 'cuid';
import Stripe from 'stripe';

import { getSubscriptionWithStripeData } from './subscriptions';
import { sendEmail } from './email';

import { Context } from '../types';
import {
  User,
  StripePlan,
  Subscription,
  CreateUserInput,
  CreateUserPayload,
  UpdateUserInput,
  UpdateUserPayload,
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

  // Create a stream for the user
  try {
    context.stream.user(userDoc.id).create({
      name: fullname,
      username,
    });
  } catch (error) {
    console.error('Failed to create a stream for user:', error);
  }

  const emailLink = await context.firebase.auth().generatePasswordResetLink(input.email);
  sendEmail({
    personalizations: [{
      to: [{
        name: `${input.firstName} ${input.lastName}`,
        email: input.email,
      }],
      // eslint-disable-next-line @typescript-eslint/camelcase
      dynamic_template_data: {
        name: input.firstName,
        emailLink,
      },
    }],
    from: {
      name: 'Bard',
      email: 'hello@getbard.com',
    },
    subject: 'Welcome to Bard (verify your email)',
    html: '<span></span>',
    templateId: 'd-df2e2ff2c3354b76aa223f4c1a6e24a8',
  });

  return { id: userDoc.id, ...userDoc.data() } as CreateUserPayload;
}

const updateUser = async (
  _: null,
  { input }: { input: UpdateUserInput },
  context: Context
): Promise<UpdateUserPayload> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  if (input.id && context.userId !== input.id) {
    throw new AuthenticationError('Not authorized');
  }

  const user = await getUserById(context.userId, context);

  if (user?.email !== input.email) {
    try {
      context.firebase.auth().updateUser(context.userId, {
        email: input.email,
        emailVerified: false,
      });
    } catch (error) {
      console.error(`Failed to update user email for ${context.userId}:`, error);
      throw new UserInputError('Could not update email');
    }
  }

  await context.db.doc(`users/${context.userId}`).set({ ...input }, { merge: true });

  return { id: context.userId };
}

const stripePlan = async (
  parent: User,
  _: null,
  context: Context,
): Promise<StripePlan | null> => {
  if (!parent?.stripePlanId || !parent?.stripeUserId) {
    return null;
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2020-03-02',
    typescript: true,
  });

  const plan: Stripe.Plan = await stripe.plans.retrieve(parent.stripePlanId, undefined, {
    stripeAccount: parent.stripeUserId || undefined,
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
  const subscriptions = await context.db
    .collection('subscriptions')
    .where('userId', '==', parent.id)
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

export const subscribers = async (
  parent: User,
  _: null,
  context: Context,
): Promise<string[]> => {
  const subscriptions = await context.db
    .collection('subscriptions')
    .where('authorId', '==', parent.id)
    .where('deletedAt', '==', null)
    .get();

  return subscriptions.docs
    .map((subDoc): string => {
      const subscription = {
        id: subDoc.id,
        ...subDoc.data()
      } as Subscription;
      
      return subscription.userId;
    });
}

const followers = async (
  parent: User,
  _: null,
  context: Context,
): Promise<Promise<User | null>[]> => {
  if (!parent.followerIds) {
    return [];
  }

  return parent.followerIds
    .map(async (
      follower: string | null
    ): Promise<User | null> => await getUserById(follower || '', context));
}

const following = async (
  parent: User,
  _: null,
  context: Context,
): Promise<Promise<User | null>[]> => {
  if (!parent.followingIds) {
    return [];
  }

  return parent.followingIds
    .map(async (
      follower: string | null
    ): Promise<User | null> => await getUserById(follower || '', context));
}

export default {
  Query: {
    user,
  },
  Mutation: {
    createUser,
    updateUser,
  },
  User: {
    stripePlan,
    subscriptions,
    subscribers,
    followers,
    following,
  }
}