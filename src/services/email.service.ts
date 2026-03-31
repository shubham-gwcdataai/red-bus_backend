import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY || 're_GEdKnXmz_LmJzngjCM9frWBwC58y1fxx9';
const resend = new Resend(resendApiKey);

export const sendPasswordResetEmail = async (
  email: string,
  resetToken: string
): Promise<void> => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  console.log('Attempting to send email to:', email);
  console.log('Using Resend API key starting with:', resendApiKey.substring(0, 10));

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
            <p style="color: #4a4a6a; line-height: 1.6;">
              We received a request to reset your password. Click the button below:
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background: #d63031; color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                Reset Password
              </a>
            </div>
            <p style="color: #4a4a6a; font-size: 14px;">
              Or copy this link: <br/>
              <span style="color: #d63031; word-break: break-all;">${resetUrl}</span>
            </p>
            <p style="color: #4a4a6a; font-size: 14px;">
              This link will expire in <strong>15 minutes</strong>.
            </p>
            <p style="color: #4a4a6a; font-size: 14px;">
              If you didn't request a password reset, please ignore this email.
            </p>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error('Resend error:', error);
      throw new Error(error.message);
    }

    console.log('Email sent successfully, ID:', data?.id);
  } catch (err) {
    console.error('Failed to send email:', err);
    throw err;
  }
};
