import { Resend } from "resend";

type SendMagicLinkInput = {
  email: string;
  magicUrl: string;
  purpose: "activate" | "signin";
};

export async function sendMagicLinkEmail({ email, magicUrl, purpose }: SendMagicLinkInput) {
  const subject = purpose === "activate" ? "Activate your Dark Drives tour" : "Your Dark Drives sign-in link";

  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    console.info(`[email:dev] ${subject} for ${email}: ${magicUrl}`);
    return;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: email,
    subject,
    text: `Open this link within 15 minutes to continue: ${magicUrl}`,
    html: `<p>Open this link within 15 minutes to continue:</p><p><a href="${magicUrl}">${magicUrl}</a></p>`
  });
}
