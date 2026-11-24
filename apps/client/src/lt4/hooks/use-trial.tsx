// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Cloud-Testphasen gibt es im selbst gehosteten LT4-Fork nicht.
export default function useTrial(): {
  isTrial: boolean;
  trialDaysLeft: number | null;
} {
  return { isTrial: false, trialDaysLeft: null };
}
