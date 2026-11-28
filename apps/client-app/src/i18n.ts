// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Übersetzungen für Oberflächen-Teile aus apps/client (z. B. Datenbanken). Der Client ist deutsch.
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import de from "../../client/public/locales/de-DE/translation.json";

i18n.use(initReactI18next).init({
  lng: "de-DE",
  fallbackLng: "de-DE",
  resources: { "de-DE": { translation: de } },
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export default i18n;
