import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const client = new ImapFlow({
  host: "imap.example.invalid",
  port: 993,
  secure: true,
  auth: { user: "synthetic@example.invalid", pass: "synthetic-only" },
  logger: false,
});

const parsed = await simpleParser(
  "From: test@example.invalid\r\nTo: crm@example.invalid\r\nSubject: Synthetic\r\nMessage-ID: <synthetic@example.invalid>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nSynthetic message only.",
);

if (!client || parsed.subject !== "Synthetic") {
  throw new Error("unexpected synthetic compatibility result");
}

console.log("imapflow constructed and synthetic MIME parsed; no network connection made");
