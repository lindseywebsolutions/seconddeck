import nodemailer from 'nodemailer';

export function createMailer(smtp) {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass }
  });
  let verifiedUntil = 0;
  let pendingVerification;

  return {
    async verify() {
      if (Date.now() < verifiedUntil) return true;
      if (!pendingVerification) {
        pendingVerification = transport.verify()
          .then((result) => {
            verifiedUntil = Date.now() + 5 * 60 * 1000;
            return result;
          })
          .finally(() => { pendingVerification = undefined; });
      }
      return pendingVerification;
    },
    async sendCode(email, code) {
      await transport.sendMail({
        from: smtp.from,
        to: email,
        subject: `${code} is your SecondDeck sign-in code`,
        text: `Your SecondDeck sign-in code is ${code}. It expires in 10 minutes. If you did not request it, you can ignore this email.`,
        html: `<div style="font-family:system-ui;background:#0c1114;color:#eef5ef;padding:32px;border-radius:18px"><p style="color:#80e4ca;letter-spacing:.12em;text-transform:uppercase">SecondDeck</p><h1 style="font-size:36px;letter-spacing:.18em">${code}</h1><p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p></div>`
      });
    }
  };
}
