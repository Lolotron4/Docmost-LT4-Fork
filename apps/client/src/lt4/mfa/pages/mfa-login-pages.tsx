// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useEffect, useState } from "react";
import {
  Alert,
  Anchor,
  Box,
  Button,
  Center,
  Container,
  Loader,
  PinInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconInfoCircle, IconShieldLock } from "@tabler/icons-react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/features/auth/components/auth-layout.tsx";
import classes from "@/features/auth/components/auth.module.css";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import APP_ROUTE, { getPostLoginRedirect } from "@/lib/app-route.ts";
import {
  enableMfaLogin,
  errorMessage,
  getMfaLoginInfo,
  IMfaLoginInfo,
  setupMfaLogin,
  verifyMfaLogin,
} from "../mfa-service";
import { MfaSetupFlow } from "../components/mfa-setup-flow";

function AuthBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <AuthLayout>
      <DocumentTitle title={title} />
      <Container size={420} className={classes.container}>
        <Box p="xl" className={classes.containerBox}>
          <Center mb="xs">
            <IconShieldLock size={36} stroke={1.5} />
          </Center>
          <Title order={1} size="h3" ta="center" fw={500} mb="md">
            {title}
          </Title>
          {children}
        </Box>
      </Container>
    </AuthLayout>
  );
}

/** Lädt den Login-Zwischenstand. Ohne gültiges MFA-Cookie geht es zurück zum Login. */
function useLoginInfo() {
  const [info, setInfo] = useState<IMfaLoginInfo | null>(null);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    getMfaLoginInfo()
      .then(setInfo)
      .catch(() => setExpired(true));
  }, []);
  return { info, expired };
}

function Expired() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Text size="sm" ta="center">
        {t("Your login session has expired. Please sign in again.")}
      </Text>
      <Button component={Link} to={APP_ROUTE.AUTH.LOGIN}>
        {t("Back to login")}
      </Button>
    </Stack>
  );
}

export function MfaChallengePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { info, expired } = useLoginInfo();
  const [useBackup, setUseBackup] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (info?.requiresMfaSetup) {
      navigate(APP_ROUTE.AUTH.MFA_SETUP_REQUIRED + window.location.search, {
        replace: true,
      });
    }
  }, [info, navigate]);

  const submit = async (value = code) => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    if (!useBackup && trimmed.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      await verifyMfaLogin(trimmed);
      navigate(getPostLoginRedirect());
    } catch (err) {
      setError(errorMessage(err, "Invalid verification code"));
      setCode("");
      if (err?.response?.status === 401) navigate(APP_ROUTE.AUTH.LOGIN);
    } finally {
      setBusy(false);
    }
  };

  const title = t("Two-factor authentication");
  if (expired) return <AuthBox title={title}><Expired /></AuthBox>;
  if (!info) {
    return (
      <AuthBox title={title}>
        <Center><Loader size="sm" /></Center>
      </AuthBox>
    );
  }

  return (
    <AuthBox title={title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Stack gap="md">
          <Text size="sm" ta="center" c="dimmed">
            {useBackup
              ? t("Enter one of your backup codes. Each backup code can only be used once.")
              : t("Enter the 6-digit code found in your authenticator app")}
          </Text>
          {useBackup ? (
            <TextInput
              label={t("Backup code")}
              placeholder="abcde-fghjk"
              autoFocus
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.currentTarget.value)}
              maxLength={32}
            />
          ) : (
            <Center>
              <PinInput
                length={6}
                type="number"
                oneTimeCode
                autoFocus
                value={code}
                onChange={setCode}
                onComplete={(v) => submit(v)}
                error={!!error}
                aria-label={t("Verification code")}
              />
            </Center>
          )}
          {error && (
            <Text c="red" size="sm" ta="center" role="alert">
              {t(error)}
            </Text>
          )}
          <Button type="submit" loading={busy} fullWidth>
            {useBackup ? t("Verify backup code") : t("Verify")}
          </Button>
          <Anchor
            component="button"
            type="button"
            size="sm"
            ta="center"
            onClick={() => {
              setUseBackup((v) => !v);
              setCode("");
              setError(null);
            }}
          >
            {useBackup ? t("Use authenticator app instead") : t("Use backup code")}
          </Anchor>
          <Anchor component={Link} to={APP_ROUTE.AUTH.LOGIN} size="sm" ta="center" c="dimmed">
            {t("Back to login")}
          </Anchor>
        </Stack>
      </form>
    </AuthBox>
  );
}

export function MfaSetupRequiredPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { info, expired } = useLoginInfo();

  useEffect(() => {
    if (info?.userHasMfa) {
      navigate(APP_ROUTE.AUTH.MFA_CHALLENGE + window.location.search, {
        replace: true,
      });
    }
  }, [info, navigate]);

  const title = t("Two-Factor authentication required");
  if (expired) return <AuthBox title={title}><Expired /></AuthBox>;
  if (!info || info.userHasMfa) {
    return (
      <AuthBox title={title}>
        <Center><Loader size="sm" /></Center>
      </AuthBox>
    );
  }

  return (
    <AuthBox title={title}>
      <Stack gap="md">
        <Alert variant="light" icon={<IconInfoCircle size={18} />}>
          {t("Your workspace requires two-factor authentication. Please set it up to continue.")}
        </Alert>
        <MfaSetupFlow
          loadSetup={setupMfaLogin}
          submit={enableMfaLogin}
          onDone={() => navigate(getPostLoginRedirect())}
        />
        <Anchor component={Link} to={APP_ROUTE.AUTH.LOGIN} size="sm" ta="center" c="dimmed">
          {t("Back to login")}
        </Anchor>
      </Stack>
    </AuthBox>
  );
}
