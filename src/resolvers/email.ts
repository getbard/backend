// Cannot use the mail package because of this issue
// https://github.com/sendgrid/sendgrid-nodejs/issues/1057
import mail from '@sendgrid/client';

export const sendEmail = async ({
  personalizations,
  from = { name: 'Bard', email: 'noreply@getbard.com' },
  subject,
  html,
  templateId,
  asm,
}: {
  personalizations: any;
  from: { name: string; email: string };
  subject: string;
  html: string;
  templateId?: string;
  asm?: { group_id: number };
}): Promise<void> => {
  mail.setApiKey(process.env.SENDGRID_API_KEY || '');

  const email = {
    personalizations,
    from,
    content: [{
      type: 'text/html',
      value: html,
    }],
    subject,
    // eslint-disable-next-line @typescript-eslint/camelcase
    template_id: templateId || '',
    // eslint-disable-next-line @typescript-eslint/camelcase
    asm: asm || { group_id: 16922 },
  }

  mail
    .request({
      body: email,
      method: 'POST',
      url: '/v3/mail/send',
    })
    .catch((error: any) => {
      console.error(`Failed to send an email to ${personalizations.to} using ${templateId}:`, JSON.stringify(error?.response?.body, null, 2));
    });
}