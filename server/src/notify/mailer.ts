import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config/env";

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

/** Everything "sent" with MAIL_TRANSPORT=memory, which only tests may use. */
export const mailOutbox: OutgoingMail[] = [];

let smtp: Transporter | undefined;

export async function sendMail(mail: OutgoingMail): Promise<void> {
  switch (config.MAIL_TRANSPORT) {
    case "memory":
      mailOutbox.push(mail);
      return;
    case "console":
      // Emailed links are credentials: print them only outside production.
      if (config.NODE_ENV === "production") {
        console.info(`Mail not sent (MAIL_TRANSPORT=console): "${mail.subject}" to ${mail.to}`);
      } else {
        console.info(`\n── Mail to ${mail.to}: ${mail.subject}\n${mail.text}\n──`);
      }
      return;
    case "smtp":
      smtp ??= nodemailer.createTransport(config.SMTP_URL);
      await smtp.sendMail({ from: config.MAIL_FROM, ...mail });
      return;
  }
}
