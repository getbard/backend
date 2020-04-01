import { AuthenticationError, ApolloError } from 'apollo-server';
import Stripe from 'stripe';

import {
  ConnectStripeAccountInput,
  ConnectStripeAccountPayload,
  CreateStripeSessionInput,
  CreateStripeSessionPayload,
} from '../generated/graphql';

const formatAmountForStripe = (
  amount: number,
  currency: string
): number => {
  const numberFormat = new Intl.NumberFormat(['en-US'], {
    style: 'currency',
    currency: currency,
    currencyDisplay: 'symbol'
  });

  const parts = numberFormat.formatToParts(amount);

  let zeroDecimalCurrency = true;
  for (const part of parts) {
    if (part.type === 'decimal') {
      zeroDecimalCurrency = false;
    }
  }

  return zeroDecimalCurrency ? amount : Math.round(amount * 100);
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

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2020-03-02',
    typescript: true,
  });

  try {
    const response = await stripe.oauth.token({
      // eslint-disable-next-line @typescript-eslint/camelcase
      grant_type: 'authorization_code',
      code: input.authCode,
    });

    const { stripe_user_id: stripeUserId } = response;

    await context.db.doc(`users/${input.userId}`).set({
      stripeUserId,
    }, { merge: true });

    return { success: true };
  } catch (error) {
    console.log('Failed to connect Stripe account:', error.message);
    throw new ApolloError(error);
  }
}

const createStripeSession = async (
  _: null,
  { input }: { input: CreateStripeSessionInput },
  context: Context,
): Promise<CreateStripeSessionPayload> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2020-03-02',
    typescript: true,
  });

  /* eslint-disable @typescript-eslint/camelcase */
  const params: Stripe.Checkout.SessionCreateParams = {
    submit_type: 'donate',
    payment_method_types: ['card'],
    line_items: [{
      name: 'One-Time Support',
      amount: formatAmountForStripe(input.amount, 'usd'),
      currency: 'usd',
      quantity: 1,
    }],
    success_url: 'http://localhost:3000/result?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: 'http://localhost:3000/result?session_id={CHECKOUT_SESSION_ID}',
  }
  /* eslint-enable @typescript-eslint/camelcase */

  const checkoutSession: Stripe.Checkout.Session = await stripe.checkout.sessions.create(params);

  return checkoutSession;
}

export default {
  Mutation: {
    connectStripeAccount,
    createStripeSession,
  },
}