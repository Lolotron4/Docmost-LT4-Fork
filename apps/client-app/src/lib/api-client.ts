// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Platzhalter nur für die Typprüfung: Code aus apps/client importiert "@/lib/api-client".
// Im Client gibt es keinen Server-Zugriff; die Datenbank nutzt src/base/base-service.ts
// (Umleitung in vite.config.ts).
const api = {
  post: async <T>(_url: string, _body?: unknown): Promise<{ data: T }> => {
    throw new Error("Kein Server im Offline-Client");
  },
};
export default api;
