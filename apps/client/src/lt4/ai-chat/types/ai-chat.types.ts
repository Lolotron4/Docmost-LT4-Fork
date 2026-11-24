// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
export interface PageMention {
  id: string;
  title: string;
  slugId?: string;
}

export interface ChatAttachment {
  id: string;
  fileName: string;
  mimeType?: string;
}
