import PostalMime from 'postal-mime';
import type { ReceiptDraft, ReceiptDraftItem } from './protocol';
import { MAX_EMAIL_BYTES, extractItems, imageUrls, isAllowedSender, receiptText } from './receipt';
import type { RecordStore } from './records';

export interface EmailEnv {
  /** Comma-separated addresses or @domains allowed to send receipts. Unset = accept nothing. */
  RECEIPT_SENDERS?: string;
  ANTHROPIC_API_KEY?: string;
  /** Overrides the default extraction model. */
  RECEIPT_MODEL?: string;
  READ_ONLY?: string;
}

export interface Mail {
  from: string;
  rawSize: number;
  subject?: string;
  date?: string;
  text?: string;
  html?: string;
}

export interface EmailDeps {
  store: Pick<RecordStore, 'put'>;
  extract: (mail: { text: string; images: string[]; date: string }) => Promise<ReceiptDraftItem[]>;
  now: Date;
  newId: () => string;
}

export type EmailOutcome = 'drafted' | 'empty' | 'rejected';

/**
 * Saves the clothes found in a forwarded receipt as a draft in the inbox store
 * for the owner to confirm. Incoming mail is unauthenticated, so anything not
 * from the allowlist is dropped before it is read or sent anywhere. Email
 * contents are never logged.
 */
export async function processReceipt(mail: Mail, env: EmailEnv, deps: EmailDeps): Promise<EmailOutcome> {
  if (env.READ_ONLY === 'true') return 'rejected';
  if (!isAllowedSender(mail.from, env.RECEIPT_SENDERS)) return 'rejected';
  if (mail.rawSize > MAX_EMAIL_BYTES) return 'rejected';

  const text = receiptText(mail);
  if (!text) return 'empty';
  const parsedDate = mail.date ? new Date(mail.date) : deps.now;
  const date = (Number.isNaN(parsedDate.getTime()) ? deps.now : parsedDate).toISOString().slice(0, 10);

  const items = await deps.extract({ text, images: imageUrls(mail.html), date });
  if (items.length === 0) return 'empty';

  const stamp = deps.now.toISOString();
  const draft: ReceiptDraft = {
    id: deps.newId(),
    type: 'receipt-draft',
    subject: (mail.subject ?? '').trim().slice(0, 200) || 'Receipt',
    items,
    source: 'email',
    createdAt: stamp,
    updatedAt: stamp,
  };
  await deps.store.put('inbox', draft.id, draft);
  return 'drafted';
}

/** Cloudflare Email Routing entry point: parses the raw message and hands it to `processReceipt`. */
export async function handleEmail(message: ForwardableEmailMessage, env: EmailEnv, store: RecordStore): Promise<void> {
  if (!isAllowedSender(message.from, env.RECEIPT_SENDERS) || message.rawSize > MAX_EMAIL_BYTES) return;
  if (!env.ANTHROPIC_API_KEY) {
    console.error('Receipt email dropped: ANTHROPIC_API_KEY is not set');
    return;
  }
  const apiKey = env.ANTHROPIC_API_KEY;
  const model = env.RECEIPT_MODEL || 'claude-haiku-5-5';
  const parsed = await PostalMime.parse(message.raw);
  try {
    await processReceipt(
      { from: message.from, rawSize: message.rawSize, subject: parsed.subject, date: parsed.date, text: parsed.text, html: parsed.html },
      env,
      { store, extract: (m) => extractItems(m, apiKey, model), now: new Date(), newId: () => crypto.randomUUID() },
    );
  } catch (err) {
    // Log the failure kind only, never the email.
    console.error('Receipt email failed:', err instanceof Error ? err.message : 'unknown error');
  }
}
