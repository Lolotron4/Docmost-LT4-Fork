// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  CopyButton,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconCheck, IconCopy, IconLink, IconPlus, IconTrash } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import useUserRole from "@/hooks/use-user-role.tsx";
import {
  createJoinLink,
  IJoinLink,
  joinLinkUrl,
  listJoinLinks,
  revokeJoinLink,
} from "../join-link-service";

const QUERY_KEY = ["lt4-join-links"];

export function JoinLinksPanel() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: QUERY_KEY, queryFn: listJoinLinks });
  const revoke = useMutation({
    mutationFn: revokeJoinLink,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleDateString(i18n.language) : t("Never");

  const confirmRevoke = (link: IJoinLink) =>
    modals.openConfirmModal({
      title: t("Delete join link"),
      centered: true,
      children: (
        <Text size="sm">
          {t("The link stops working immediately. Accounts that were already created remain.")}
        </Text>
      ),
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => revoke.mutate(link.id),
    });

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Text size="sm" c="dimmed" style={{ flex: 1 }}>
          {t(
            "Anyone with a join link can create their own account, with an email address or just a username. No email is sent.",
          )}
        </Text>
        <CreateJoinLinkButton />
      </Group>

      {!isLoading && data?.items.length === 0 && (
        <Text size="sm" c="dimmed" ta="center" py="lg">
          {t("No join links yet")}
        </Text>
      )}

      {!!data?.items.length && (
        <Table.ScrollContainer minWidth={640}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("Code")}</Table.Th>
                <Table.Th>{t("Role")}</Table.Th>
                <Table.Th>{t("Uses")}</Table.Th>
                <Table.Th>{t("Expires")}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.items.map((link) => (
                <Table.Tr key={link.id} opacity={link.isActive ? 1 : 0.55}>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Text ff="monospace" size="sm">
                        {link.code}
                      </Text>
                      {!link.isActive && (
                        <Badge size="xs" color="gray" variant="light">
                          {t("Inactive")}
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{link.role === "admin" ? t("Admin") : t("Member")}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {link.useCount}
                      {link.maxUses ? ` / ${link.maxUses}` : ""}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(link.expiresAt)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                      <CopyButton value={joinLinkUrl(link.code)}>
                        {({ copied, copy }) => (
                          <Tooltip label={copied ? t("Copied") : t("Copy link")} withArrow>
                            <ActionIcon variant="subtle" color={copied ? "teal" : "gray"} onClick={copy} aria-label={t("Copy link")}>
                              {copied ? <IconCheck size={16} /> : <IconLink size={16} />}
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </CopyButton>
                      <CopyButton value={link.code}>
                        {({ copied, copy }) => (
                          <Tooltip label={copied ? t("Copied") : t("Copy code")} withArrow>
                            <ActionIcon variant="subtle" color={copied ? "teal" : "gray"} onClick={copy} aria-label={t("Copy code")}>
                              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </CopyButton>
                      <Tooltip label={t("Delete")} withArrow>
                        <ActionIcon variant="subtle" color="red" onClick={() => confirmRevoke(link)} aria-label={t("Delete")}>
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  );
}

function CreateJoinLinkButton() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isOwner, isAdmin } = useUserRole();
  const [opened, setOpened] = useState(false);
  const [role, setRole] = useState<"member" | "admin">("member");
  const [maxUses, setMaxUses] = useState<number | string>("");
  const [expiresInDays, setExpiresInDays] = useState<number | string>(14);
  const [created, setCreated] = useState<IJoinLink | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setOpened(false);
    setCreated(null);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const link = await createJoinLink({
        role,
        maxUses: typeof maxUses === "number" ? maxUses : undefined,
        expiresInDays: typeof expiresInDays === "number" ? expiresInDays : undefined,
      });
      setCreated(link);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    } catch (err) {
      notifications.show({ message: err?.response?.data?.message, color: "red" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button leftSection={<IconPlus size={16} />} onClick={() => setOpened(true)} style={{ flexShrink: 0 }}>
        {t("Create join link")}
      </Button>
      <Modal opened={opened} onClose={close} title={t("Create join link")} centered>
        {created ? (
          <Stack gap="md">
            <Text size="sm">{t("Share the link, or give out the code. It can be entered at /join.")}</Text>
            <Text ff="monospace" fw={600} size="xl" ta="center">
              {created.code}
            </Text>
            <Text size="xs" c="dimmed" ta="center" style={{ wordBreak: "break-all" }}>
              {joinLinkUrl(created.code)}
            </Text>
            <Group grow>
              <CopyButton value={joinLinkUrl(created.code)}>
                {({ copied, copy }) => (
                  <Button variant="default" onClick={copy} leftSection={copied ? <IconCheck size={16} /> : <IconLink size={16} />}>
                    {copied ? t("Copied") : t("Copy link")}
                  </Button>
                )}
              </CopyButton>
              <CopyButton value={created.code}>
                {({ copied, copy }) => (
                  <Button variant="default" onClick={copy} leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}>
                    {copied ? t("Copied") : t("Copy code")}
                  </Button>
                )}
              </CopyButton>
            </Group>
            <Button onClick={close}>{t("Done")}</Button>
          </Stack>
        ) : (
          <Stack gap="md">
            <Select
              label={t("Role")}
              data={[
                { value: "member", label: t("Member") },
                ...(isAdmin || isOwner ? [{ value: "admin", label: t("Admin") }] : []),
              ]}
              value={role}
              onChange={(v) => v && setRole(v as "member" | "admin")}
              allowDeselect={false}
            />
            <NumberInput
              label={t("Maximum number of accounts")}
              description={t("Leave empty for no limit, e.g. the size of the class.")}
              min={1}
              max={10000}
              value={maxUses}
              onChange={(v) => setMaxUses(v as number | string)}
              allowDecimal={false}
            />
            <NumberInput
              label={t("Valid for (days)")}
              description={t("Leave empty to keep the link valid until you delete it.")}
              min={1}
              max={365}
              value={expiresInDays}
              onChange={(v) => setExpiresInDays(v as number | string)}
              allowDecimal={false}
            />
            <Button onClick={submit} loading={busy}>
              {t("Create")}
            </Button>
          </Stack>
        )}
      </Modal>
    </>
  );
}
