import { ApolloError } from 'apollo-server';

import { sendEmail } from './email';

import { Context } from '../types';
import { AuthLink } from './../generated/graphql';

const authLink = async (
  _: null,
  args: { type: AuthLink; email: string },
  context: Context
): Promise<string> => {
  let emailLink = '';
  let templateId = '';
  let subject = '';

  if (args.type === 'passwordReset') {
    emailLink = await context.firebase.auth().generatePasswordResetLink(args.email);
    templateId = 'd-a58b694b577d41319a6158e8b77c35ca';
    subject = 'Reset your password on Bard';
  } else if (args.type === 'emailVerification') {
    emailLink = await context.firebase.auth().generateEmailVerificationLink(args.email);
    templateId = 'd-0f8b72e2c76f4d9595f952fd1a19e372';
    subject = 'Verify your email on Bard';
  }

  if (!(emailLink && templateId && subject)) {
    throw new ApolloError('Invalid email input');
  }

  sendEmail({
    personalizations: [{
      to: [{
        name: args.email,
        email: args.email,
      }],
      // eslint-disable-next-line @typescript-eslint/camelcase
      dynamic_template_data: {
        emailLink,
      },
    }],
    from: {
      name: 'Bard',
      email: 'noreply@getbard.com',
    },
    subject,
    html: '<span></span>',
    templateId,
  });

  return '';
}

export default {
  Query: {
    authLink,
  },
  Mutation: {},
};
