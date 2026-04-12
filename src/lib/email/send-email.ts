import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM_ADDRESS = "Nuvvy Ops <ops@nuvvy.in>";
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || "nuvvy.gardens@gmail.com";

/**
 * Send an email notification. Fire-and-forget — errors are logged but never thrown.
 */
export async function sendNotificationEmail(subject: string, html: string) {
  try {
    await transporter.sendMail({
      from: FROM_ADDRESS,
      to: NOTIFICATION_EMAIL,
      subject,
      html,
    });
  } catch (err) {
    console.error("Email send failed:", err);
  }
}
