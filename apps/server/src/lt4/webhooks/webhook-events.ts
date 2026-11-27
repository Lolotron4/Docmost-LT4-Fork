// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Ereignisse, die ein Webhook melden kann, und die Texte dazu (Deutsch/Englisch).

export const WEBHOOK_EVENTS = [
  'page.created',
  'page.trashed',
  'comment.created',
  'comment.resolved',
  'review.requested',
  'review.approved',
  'review.rejected',
  'read.requested',
  'read.completed',
  'member.joined',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Ereignisse ohne Bereich: gehen nur an Webhooks für "alle Bereiche". */
export const WORKSPACE_EVENTS: WebhookEvent[] = ['member.joined'];

export const WEBHOOK_TYPES = ['discord', 'generic'] as const;
export type WebhookType = (typeof WEBHOOK_TYPES)[number];

export const WEBHOOK_LANGUAGES = ['de', 'en'] as const;
export type WebhookLanguage = (typeof WEBHOOK_LANGUAGES)[number];

/** Audit-Ereignis des Kerns -> Webhook-Ereignis */
export const AUDIT_TO_WEBHOOK: Record<string, WebhookEvent> = {
  'page.created': 'page.created',
  'page.trashed': 'page.trashed',
  'comment.created': 'comment.created',
  'comment.resolved': 'comment.resolved',
  'page.approval_requested': 'review.requested',
  'page.verified': 'review.approved',
  'page.approval_rejected': 'review.rejected',
  'page.read_confirmation_requested': 'read.requested',
  'page.read_confirmation_completed': 'read.completed',
  'user.created': 'member.joined',
};

/** Discord-Farben (dezimal) je Ereignis */
export const EVENT_COLORS: Record<WebhookEvent, number> = {
  'page.created': 0x228be6,
  'page.trashed': 0x868e96,
  'comment.created': 0x7950f2,
  'comment.resolved': 0x40c057,
  'review.requested': 0xfab005,
  'review.approved': 0x40c057,
  'review.rejected': 0xfa5252,
  'read.requested': 0x15aabf,
  'read.completed': 0x40c057,
  'member.joined': 0x12b886,
};

type Texts = {
  title: Record<WebhookEvent, string>;
  manyPages: string;
  untitled: string;
  someone: string;
  reply: string;
  due: string;
  allRead: string;
  test: string;
  testText: string;
  space: string;
  andMore: string;
};

export const TEXTS: Record<WebhookLanguage, Texts> = {
  de: {
    title: {
      'page.created': 'Neue Seite',
      'page.trashed': 'Seite in den Papierkorb verschoben',
      'comment.created': 'Neuer Kommentar',
      'comment.resolved': 'Kommentar erledigt',
      'review.requested': 'Seite zur Prüfung eingereicht',
      'review.approved': 'Seite genehmigt',
      'review.rejected': 'Seite zur Überarbeitung zurückgegeben',
      'read.requested': 'Bitte lesen und bestätigen',
      'read.completed': 'Alle haben gelesen',
      'member.joined': 'Neues Mitglied',
    },
    manyPages: '{n} neue Seiten',
    untitled: 'Ohne Titel',
    someone: 'Jemand',
    reply: 'Antwort',
    due: 'Bis',
    allRead: 'Alle {n} Personen haben das Lesen bestätigt.',
    test: 'Test von LT4-Docs',
    testText: 'Wenn du das liest, funktioniert der Webhook „{name}“.',
    space: 'Bereich',
    andMore: '… und {n} weitere',
  },
  en: {
    title: {
      'page.created': 'New page',
      'page.trashed': 'Page moved to trash',
      'comment.created': 'New comment',
      'comment.resolved': 'Comment resolved',
      'review.requested': 'Page submitted for review',
      'review.approved': 'Page approved',
      'review.rejected': 'Page returned for revision',
      'read.requested': 'Please read and confirm',
      'read.completed': 'Everyone has read it',
      'member.joined': 'New member',
    },
    manyPages: '{n} new pages',
    untitled: 'Untitled',
    someone: 'Someone',
    reply: 'Reply',
    due: 'Due',
    allRead: 'All {n} people confirmed reading.',
    test: 'Test from LT4-Docs',
    testText: 'If you can read this, the webhook "{name}" works.',
    space: 'Space',
    andMore: '… and {n} more',
  },
};

export function fill(text: string, vars: Record<string, string | number>) {
  return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
