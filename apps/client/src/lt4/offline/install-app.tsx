// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useEffect, useState } from "react";
import { Button, Paper, Text, Group } from "@mantine/core";
import { IconDeviceMobileDown } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

// Chrome/Edge/Android melden "installierbar" nur einmal früh – darum global abfangen.
let deferredPrompt: any = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((l) => l());
  });
}

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** Hinweis + Knopf zum Installieren der App (Startbildschirm). */
export function InstallAppCard() {
  const { t } = useTranslation();
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  if (isStandalone()) return null;
  if (!deferredPrompt && !isIos()) return null;

  return (
    <Paper withBorder radius="md" p="md">
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <div>
          <Text fw={500}>{t("Install app")}</Text>
          <Text size="sm" c="dimmed">
            {deferredPrompt
              ? t("Add LT4-Docs to your home screen. Saved pages then open without a connection.")
              : t('On iPhone/iPad: tap "Share" in Safari, then "Add to Home Screen".')}
          </Text>
        </div>
        {deferredPrompt && (
          <Button
            leftSection={<IconDeviceMobileDown size={16} />}
            onClick={async () => {
              const prompt = deferredPrompt;
              deferredPrompt = null;
              await prompt.prompt();
              force((n) => n + 1);
            }}
          >
            {t("Install")}
          </Button>
        )}
      </Group>
    </Paper>
  );
}
