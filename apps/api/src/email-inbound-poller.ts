import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

async function run() {
  const host = process.env.EMAIL_IMAP_HOST || "imap.gmail.com";
  const port = Number(process.env.EMAIL_IMAP_PORT || "993");
  const user = process.env.EMAIL_IMAP_USER || process.env.EMAIL_SMTP_USER;
  const pass = process.env.EMAIL_IMAP_PASS || process.env.EMAIL_SMTP_PASS;
  const mailbox = process.env.EMAIL_IMAP_MAILBOX || "NCC-INBOUND";

  const inboundUrl = process.env.EMAIL_INBOUND_API_URL;
  const inboundSecret = process.env.EMAIL_INBOUND_SECRET;

  if (!user || !pass) {
    console.error("[email-poller] Missing EMAIL_IMAP_USER/EMAIL_IMAP_PASS (or SMTP equivalents)");
    process.exit(1);
  }
  if (!inboundUrl || !inboundSecret) {
    console.error(
      "[email-poller] EMAIL_INBOUND_API_URL and EMAIL_INBOUND_SECRET must be set for forwarding replies",
    );
    process.exit(1);
  }

  const client = new ImapFlow({
    host,
    port,
    secure: port === 993,
    auth: {
      user,
      pass,
    },
  });

  console.log(
    `[email-poller] Connecting to IMAP host=${host} port=${port} user=${user} mailbox=${mailbox}`,
  );

  try {
    await client.connect();
    const lock = await client.getMailboxLock(mailbox);

    try {
      const unseen = await client.search({ seen: false });
      if (!unseen || unseen.length === 0) {
        console.log("[email-poller] No unseen messages; exiting");
        return;
      }

      console.log(`[email-poller] Found ${unseen.length} unseen messages`);

      for (const seq of unseen) {
        try {
          const message = await client.fetchOne(seq, { envelope: true, source: true });
          if (!message || !message.source) {
            continue;
          }

          const parsed = await simpleParser(message.source as Buffer);
          const subject = parsed.subject || "";
          const fromAddr = parsed.from?.value?.[0]?.address || "";
          const textBody = (parsed.text || parsed.html || "").trim();

          if (!fromAddr || !textBody || !subject) {
            console.warn(
              "[email-poller] Skipping message without from/subject/body",
              {
                uid: message.uid,
                subject,
                from: fromAddr,
              },
            );
            // Mark as seen to avoid busy-looping on bad messages.
            await client.messageFlagsAdd(seq, ["\\Seen"]);
            continue;
          }

          console.log(
            "[email-poller] Forwarding inbound reply",
            JSON.stringify({ from: fromAddr, subject }),
          );

          const res = await fetch(inboundUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-email-inbound-secret": inboundSecret,
            },
            body: JSON.stringify({
              subject,
              fromEmail: fromAddr,
              textBody,
            }),
          });

          if (res.ok || res.status === 204) {
            console.log(
              `[email-poller] Inbound reply stored successfully; marking message seen (status=${res.status})`,
            );
            await client.messageFlagsAdd(seq, ["\\Seen"]);
          } else {
            const bodyText = await res.text();
            console.error(
              `[email-poller] Failed to forward inbound reply (status=${res.status}): ${bodyText}`,
            );
          }
        } catch (err: any) {
          console.error("[email-poller] Error processing message", err?.message ?? err);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err: any) {
    console.error("[email-poller] Fatal error", err?.message ?? err);
    process.exit(1);
  }
}

run().catch(err => {
  console.error("[email-poller] Unhandled", err);
  process.exit(1);
});
