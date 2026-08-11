import nodemailer from "nodemailer";

export type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function isSmtpConfigured(): boolean {
  return Boolean(
    env("SMTP_HOST") &&
      env("SMTP_USER") &&
      env("SMTP_PASS") &&
      (env("SMTP_FROM") || env("SMTP_USER"))
  );
}

export function smtpConfigHint(): string {
  return "Configura en Vercel: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_FROM. En IONOS el usuario debe ser el email completo y la contraseña la del buzón (webmail).";
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
}): Promise<void> {
  if (!isSmtpConfigured()) {
    throw new Error(smtpConfigHint());
  }

  const host = env("SMTP_HOST");
  const port = Number(env("SMTP_PORT") || "587");
  const user = env("SMTP_USER");
  const pass = env("SMTP_PASS");
  const from = env("SMTP_FROM") || user;
  const secureFlag = env("SMTP_SECURE").toLowerCase();
  const secure =
    secureFlag === "true" ||
    secureFlag === "1" ||
    (secureFlag === "" && port === 465);

  // IONOS: 465 = TLS implícito; 587 = STARTTLS (secure: false)
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure && port === 587,
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: opts.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType ?? "application/pdf",
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/535|EAUTH|Invalid login|credentials/i.test(msg)) {
      throw new Error(
        "IONOS rechazó el login SMTP (535). Revisa en Vercel: SMTP_USER = email completo del buzón, SMTP_PASS = contraseña de ese buzón (sin espacios), host smtp.ionos.es o smtp.ionos.com, y SMTP_FROM con el mismo email."
      );
    }
    throw err instanceof Error ? err : new Error(msg);
  }
}

export function fillEmailTemplate(
  template: string,
  vars: {
    number: string;
    company: string;
    client: string;
    contact: string;
    total?: string;
    dueDate?: string;
    remaining?: string;
  }
): string {
  return template
    .replaceAll("{{number}}", vars.number)
    .replaceAll("{{company}}", vars.company)
    .replaceAll("{{client}}", vars.client)
    .replaceAll("{{contact}}", vars.contact)
    .replaceAll("{{total}}", vars.total ?? "")
    .replaceAll("{{dueDate}}", vars.dueDate ?? "")
    .replaceAll("{{remaining}}", vars.remaining ?? "");
}
