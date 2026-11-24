// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useEffect, useState } from "react";
import {
  Alert,
  Anchor,
  Box,
  Button,
  Container,
  PasswordInput,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconAlertCircle } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/features/auth/components/auth-layout.tsx";
import classes from "@/features/auth/components/auth.module.css";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import APP_ROUTE from "@/lib/app-route.ts";
import {
  getJoinLinkInfo,
  IJoinLinkInfo,
  registerWithJoinLink,
} from "../join-link-service";
import { USERNAME_PATTERN } from "../username";
import SsoLogin from "@/lt4/components/sso-login";
import { useWorkspacePublicDataQuery } from "@/features/workspace/queries/workspace-query.ts";

type Method = "username" | "email";

export default function JoinPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [info, setInfo] = useState<IJoinLinkInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [method, setMethod] = useState<Method>("username");
  const [busy, setBusy] = useState(false);
  const { data: publicData } = useWorkspacePublicDataQuery();
  const ssoOnly = !!publicData?.enforceSso;

  const check = async (value = code) => {
    if (!value.trim()) return;
    setChecking(true);
    try {
      setInfo(await getJoinLinkInfo(value));
    } catch (err) {
      notifications.show({
        message: err?.response?.data?.message,
        color: "red",
      });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (params.get("code")) check(params.get("code"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const form = useForm({
    initialValues: { name: "", username: "", email: "", password: "" },
    validate: {
      name: (v) => (v.trim() ? null : t("Name is required")),
      username: (v) =>
        method !== "username" || USERNAME_PATTERN.test(v.trim().toLowerCase())
          ? null
          : t("3-32 characters: letters, digits, dot, dash or underscore"),
      email: (v) =>
        method !== "email" || /^\S+@\S+\.\S+$/.test(v.trim())
          ? null
          : t("Invalid email"),
      password: (v) =>
        v.length >= 8 ? null : t("Password must be at least 8 characters"),
    },
  });

  const submit = form.onSubmit(async (values) => {
    setBusy(true);
    try {
      const result = await registerWithJoinLink({
        code,
        method,
        name: values.name.trim(),
        password: values.password,
        ...(method === "username"
          ? { username: values.username.trim().toLowerCase() }
          : { email: values.email.trim() }),
      });
      if (result.requiresLogin) {
        notifications.show({
          message: t(
            "Account created successfully. Please log in to set up two-factor authentication.",
          ),
        });
        navigate(APP_ROUTE.AUTH.LOGIN);
      } else {
        window.location.href = APP_ROUTE.HOME;
      }
    } catch (err) {
      const message = err?.response?.data?.message;
      notifications.show({
        message: t(Array.isArray(message) ? message[0] : (message ?? "Error")),
        color: "red",
      });
    } finally {
      setBusy(false);
    }
  });

  const title = info?.valid
    ? t("Join {{name}}", { name: info.workspaceName })
    : t("Create account");

  return (
    <AuthLayout>
      <DocumentTitle title={title} />
      <Container size={420} className={classes.container}>
        <Box p="xl" className={classes.containerBox}>
          <Title order={1} size="h2" ta="center" fw={500} mb="md">
            {title}
          </Title>

          {!info?.valid ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                check();
              }}
            >
              <Stack gap="md">
                {info && !info.valid && (
                  <Alert
                    color="red"
                    variant="light"
                    icon={<IconAlertCircle size={18} />}
                  >
                    {t(info.reason ?? "This join link is invalid")}
                  </Alert>
                )}
                <TextInput
                  label={t("Registration code")}
                  placeholder="ABCD-EFGH-JKMN"
                  value={code}
                  onChange={(e) => setCode(e.currentTarget.value)}
                  autoFocus
                  styles={{
                    input: {
                      fontFamily: "monospace",
                      textTransform: "uppercase",
                    },
                  }}
                />
                <Button
                  type="submit"
                  loading={checking}
                  disabled={!code.trim()}
                >
                  {t("Continue")}
                </Button>
              </Stack>
            </form>
          ) : (
            <>
              <SsoLogin mode="join" joinCode={code} />
              {!ssoOnly && (
                <form onSubmit={submit}>
                  <Stack gap="md">
                    <div>
                      <Text size="sm" fw={500} mb={6}>
                        {t("Sign in with")}
                      </Text>
                      <SegmentedControl
                        fullWidth
                        value={method}
                        onChange={(v) => setMethod(v as Method)}
                        data={[
                          { value: "username", label: t("Username") },
                          { value: "email", label: t("Email") },
                        ]}
                      />
                    </div>
                    <TextInput
                      label={t("Name")}
                      placeholder={t("Your name")}
                      autoComplete="name"
                      {...form.getInputProps("name")}
                    />
                    {method === "username" ? (
                      <TextInput
                        label={t("Username")}
                        description={t(
                          "You sign in with this. No email address needed.",
                        )}
                        placeholder="max.muster"
                        autoComplete="username"
                        autoCapitalize="none"
                        {...form.getInputProps("username")}
                      />
                    ) : (
                      <TextInput
                        type="email"
                        label={t("Email")}
                        placeholder="email@example.com"
                        autoComplete="email"
                        {...form.getInputProps("email")}
                      />
                    )}
                    <PasswordInput
                      label={t("Password")}
                      description={t("At least 8 characters")}
                      autoComplete="new-password"
                      {...form.getInputProps("password")}
                    />
                    <Button type="submit" loading={busy}>
                      {t("Create account")}
                    </Button>
                  </Stack>
                </form>
              )}
            </>
          )}

          <Text size="sm" ta="center" mt="md">
            {t("Already have an account?")}{" "}
            <Anchor component={Link} to={APP_ROUTE.AUTH.LOGIN} size="sm">
              {t("Login")}
            </Anchor>
          </Text>
        </Box>
      </Container>
    </AuthLayout>
  );
}
