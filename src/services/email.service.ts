import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY || 're_GEdKnXmz_LmJzngjCM9frWBwC58y1fxx9';
const resend = new Resend(resendApiKey);

export const sendPasswordResetEmail = async (
  email: string,
  resetToken: string
): Promise<void> => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  console.log('Attempting to send email to:', email);

  try {
    const { data, error } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: email,
      subject: 'Reset Your redBus Password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #d63031; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">redBus</h1>
          </div>
          <div style="padding: 30px; background: #f5f7fa;">
            <h2 style="color: #1a1a2e;">Reset Your Password</h2>
            <p>We received a request to reset your password.</p>
            <p>Reset link: ${resetUrl}</p>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error('Resend API error:', error);
      return;
    }

    console.log('Email sent successfully, ID:', data?.id);
  } catch (err) {
    console.error('Resend exception:', err);
    return;
  }
};
