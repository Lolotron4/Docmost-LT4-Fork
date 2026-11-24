// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Seitenprüfung einrichten und Aktionen ausführen (prüfen, einreichen,
// freigeben, zurückweisen, zurückziehen).
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Radio,
  Select,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { timeAgo, formatFullDateTime } from "@/lib/time.ts";
import {
  getVerifierCandidates,
  IPageVerificationInfo,
  PeriodUnit,
  rejectVerification,
  removeVerification,
  setupVerification,
  verificationAction,
  VerificationType,
} from "../services/page-verification-service";
import {
  invalidateVerification,
  setVerificationInfo,
  usePageVerificationInfo,
} from "../queries";
import { VerificationStateBadge } from "./verification-state";

const PERIODS: { value: string; label: string; amount: number | null; unit: PeriodUnit | null }[] = [
  { value: "1-week", label: "Every week", amount: 1, unit: "week" },
  { value: "1-month", label: "Every month", amount: 1, unit: "month" },
  { value: "3-month", label: "Every 3 months", amount: 3, unit: "month" },
  { value: "6-month", label: "Every 6 months", amount: 6, unit: "month" },
  { value: "1-year", label: "Every year", amount: 1, unit: "year" },
  { value: "never", label: "Never expires", amount: null, unit: null },
];

const periodValue = (amount: number | null, unit: PeriodUnit | null) =>
  PERIODS.find((p) => p.amount === amount && p.unit === unit)?.value ??
  (amount && unit ? `${amount}-${unit}` : "never");

const errorMessage = (err: any) => {
  const msg = err?.response?.data?.message ?? err?.message;
  return Array.isArray(msg) ? msg.join(", ") : msg;
};

type Props = { pageId: string; opened: boolean; onClose: () => void };

export function PageVerificationModal({ pageId, opened, onClose }: Props) {
  const { t } = useTranslation();
  const { data: info, isLoading } = usePageVerificationInfo(opened ? pageId : undefined);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!opened) setEditing(false);
  }, [opened]);

  const showSetup = !!info && (editing || (!info.verification && info.permissions.canManage));

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Page review")}
      size="lg"
    >
      {isLoading || !info ? (
        <Group justify="center" p="lg">
          <Loader size="sm" />
        </Group>
      ) : showSetup ? (
        <SetupForm
          info={info}
          onDone={() => setEditing(false)}
          onCancel={() => (info.verification ? setEditing(false) : onClose())}
        />
      ) : !info.verification ? (
        <Text size="sm" c="dimmed">
          {t("No review is set up for this page.")}
        </Text>
      ) : (
        <StatusView info={info} onEdit={() => setEditing(true)} onRemoved={onClose} />
      )}
    </Modal>
  );
}

function SetupForm({
  info,
  onDone,
  onCancel,
}: {
  info: IPageVerificationInfo;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const v = info.verification;
  const [type, setType] = useState<VerificationType>(v?.type ?? "qms");
  const [verifierIds, setVerifierIds] = useState<string[]>(info.verifiers.map((u) => u.id));
  const [period, setPeriod] = useState<string>(
    v ? periodValue(v.periodAmount, v.periodUnit) : "6-month",
  );
  const [busy, setBusy] = useState(false);

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["page-verification-candidates", info.pageId],
    queryFn: () => getVerifierCandidates(info.pageId),
  });

  const userOptions = useMemo(() => {
    const map = new Map(candidates.map((u) => [u.id, u]));
    for (const u of info.verifiers) if (!map.has(u.id)) map.set(u.id, u);
    return [...map.values()].map((u) => ({ value: u.id, label: u.name || t("Unknown user") }));
  }, [candidates, info.verifiers, t]);

  const periodOptions = useMemo(() => {
    const list = PERIODS.map((p) => ({ value: p.value, label: t(p.label) }));
    if (!PERIODS.some((p) => p.value === period)) {
      list.unshift({ value: period, label: period });
    }
    return list;
  }, [period, t]);

  const typeChangeWarning = !!v && v.type !== type;

  const save = async () => {
    if (verifierIds.length === 0) {
      notifications.show({ message: t("Choose at least one reviewer."), color: "red" });
      return;
    }
    let amount: number | null = null;
    let unit: PeriodUnit | null = null;
    if (type === "expiring" && period !== "never") {
      const known = PERIODS.find((p) => p.value === period);
      if (known) {
        amount = known.amount;
        unit = known.unit;
      } else {
        const [a, u] = period.split("-");
        amount = Number(a);
        unit = u as PeriodUnit;
      }
    }
    setBusy(true);
    try {
      const res = await setupVerification({
        pageId: info.pageId,
        type,
        verifierIds,
        periodAmount: amount,
        periodUnit: unit,
      });
      setVerificationInfo(res);
      onDone();
    } catch (err) {
      notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="md">
      <Radio.Group
        value={type}
        onChange={(value) => setType(value as VerificationType)}
        label={t("Kind of review")}
      >
        <Stack gap="xs" mt="xs">
          <Radio.Card value="qms" p="sm" radius="md" withBorder>
            <Group wrap="nowrap" align="flex-start">
              <Radio.Indicator />
              <div>
                <Text fw={500} size="sm">
                  {t("Approval")}
                </Text>
                <Text size="xs" c="dimmed">
                  {t("Authors submit the page, reviewers approve it or return it with a comment. Changes after approval make it a draft again.")}
                </Text>
              </div>
            </Group>
          </Radio.Card>
          <Radio.Card value="expiring" p="sm" radius="md" withBorder>
            <Group wrap="nowrap" align="flex-start">
              <Radio.Indicator />
              <div>
                <Text fw={500} size="sm">
                  {t("Regular check")}
                </Text>
                <Text size="xs" c="dimmed">
                  {t("Reviewers confirm that the page is correct. The check can expire, and reviewers are reminded before it does.")}
                </Text>
              </div>
            </Group>
          </Radio.Card>
        </Stack>
      </Radio.Group>

      {typeChangeWarning && (
        <Alert color="yellow" variant="light">
          {t("Changing the kind of review resets the current status.")}
        </Alert>
      )}

      <MultiSelect
        label={t("Reviewers")}
        description={t("Only people with access to this page can be reviewers.")}
        placeholder={verifierIds.length ? undefined : t("Choose people")}
        data={userOptions}
        value={verifierIds}
        onChange={setVerifierIds}
        searchable
        maxValues={20}
        nothingFoundMessage={isLoading ? t("Loading…") : t("No people found")}
        comboboxProps={{ withinPortal: true }}
      />

      {type === "expiring" && (
        <Select
          label={t("Check again")}
          data={periodOptions}
          value={period}
          onChange={(value) => setPeriod(value ?? "never")}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
        />
      )}

      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button onClick={save} loading={busy}>
          {t("Save")}
        </Button>
      </Group>
    </Stack>
  );
}

function UserLine({ label, user, date }: { label: string; user: { name: string | null } | null; date: string | null }) {
  const { t } = useTranslation();
  if (!date) return null;
  return (
    <Text size="sm">
      <Tooltip label={formatFullDateTime(new Date(date))} withArrow>
        <span>
          {t(label, {
            name: user?.name || t("Unknown user"),
            time: timeAgo(new Date(date)),
          })}
        </span>
      </Tooltip>
    </Text>
  );
}

function StatusView({
  info,
  onEdit,
  onRemoved,
}: {
  info: IPageVerificationInfo;
  onEdit: () => void;
  onRemoved: () => void;
}) {
  const { t } = useTranslation();
  const v = info.verification!;
  const p = info.permissions;
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState("");

  const run = async (key: string, fn: () => Promise<IPageVerificationInfo>) => {
    setBusy(key);
    try {
      const res = await fn();
      setVerificationInfo(res);
      setRejecting(false);
      setComment("");
    } catch (err) {
      notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });
      invalidateVerification(info.pageId);
    } finally {
      setBusy(null);
    }
  };

  const remove = () =>
    modals.openConfirmModal({
      title: t("Remove review"),
      children: (
        <Text size="sm">
          {t("The review status and the list of reviewers are removed from this page.")}
        </Text>
      ),
      labels: { confirm: t("Remove"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await removeVerification(info.pageId);
          invalidateVerification(info.pageId);
          onRemoved();
        } catch (err) {
          notifications.show({ message: t(errorMessage(err) ?? "Error"), color: "red" });
        }
      },
    });

  const isQms = v.type === "qms";
  const state = v.state;
  const describe: Record<string, string> = {
    unverified: "No reviewer has checked this page yet.",
    verified: "A reviewer has confirmed this page.",
    expiring: "The check expires soon. A reviewer should look at the page again.",
    expired: "The check has expired. A reviewer should look at the page again.",
    changed: "The page was changed after it was checked.",
    draft: "The page has not been submitted for approval yet.",
    in_approval: "The page is waiting for a reviewer.",
    approved: "The page has been approved.",
    rejected: "A reviewer returned the page for revision.",
  };

  const canWithdraw = isQms && state === "in_approval" && (p.canRequest || p.canVerify || p.canManage);

  return (
    <Stack gap="md">
      <div>
        <Group gap="xs" mb={6}>
          <VerificationStateBadge state={state} size="lg" />
          <Text size="xs" c="dimmed">
            {isQms ? t("Approval") : t("Regular check")}
          </Text>
        </Group>
        <Text size="sm" c="dimmed">
          {t(describe[state])}
        </Text>
      </div>

      <Stack gap={4}>
        {isQms && state === "in_approval" && (
          <UserLine label="Submitted by {{name}} {{time}}" user={v.requestedBy} date={v.requestedAt} />
        )}
        {(state === "approved" || !isQms) && (
          <UserLine
            label={isQms ? "Approved by {{name}} {{time}}" : "Verified by {{name}} {{time}}"}
            user={v.verifiedBy}
            date={v.verifiedAt}
          />
        )}
        {!isQms && v.verifiedAt && (
          <Text size="sm">
            {v.expiresAt
              ? t("Valid until {{date}}", { date: formatFullDateTime(new Date(v.expiresAt)) })
              : t("The check does not expire.")}
          </Text>
        )}
        {v.invalidatedAt && (state === "changed" || state === "draft") && (
          <UserLine label="Changed by {{name}} {{time}}" user={v.invalidatedBy} date={v.invalidatedAt} />
        )}
      </Stack>

      {state === "rejected" && (
        <Alert color="red" variant="light" title={t("Returned by {{name}}", { name: v.rejectedBy?.name || t("Unknown user") })}>
          {v.rejectionComment ? (
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
              {v.rejectionComment}
            </Text>
          ) : (
            <Text size="sm" c="dimmed">
              {t("No comment")}
            </Text>
          )}
        </Alert>
      )}

      <div>
        <Text size="sm" fw={500} mb={6}>
          {t("Reviewers")}
        </Text>
        <Group gap="sm">
          {info.verifiers.map((u) => (
            <Group key={u.id} gap={6} wrap="nowrap">
              <CustomAvatar avatarUrl={u.avatarUrl ?? undefined} name={u.name ?? ""} size={24} />
              <Text size="sm">{u.name}</Text>
            </Group>
          ))}
          {info.verifiers.length === 0 && (
            <Text size="sm" c="dimmed">
              {t("No reviewers")}
            </Text>
          )}
        </Group>
        {p.isVerifier && (
          <Text size="xs" c="dimmed" mt={6}>
            {t("You are a reviewer of this page.")}
          </Text>
        )}
      </div>

      {rejecting ? (
        <Stack gap="xs">
          <Textarea
            label={t("What should be improved?")}
            placeholder={t("Optional comment for the author")}
            autosize
            minRows={3}
            maxLength={2000}
            value={comment}
            onChange={(e) => setComment(e.currentTarget.value)}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRejecting(false)}>
              {t("Cancel")}
            </Button>
            <Button
              color="red"
              loading={busy === "reject"}
              onClick={() => run("reject", () => rejectVerification(info.pageId, comment))}
            >
              {t("Return for revision")}
            </Button>
          </Group>
        </Stack>
      ) : (
        <Group gap="sm">
          {!isQms && p.canVerify && (
            <Button
              loading={busy === "verify"}
              onClick={() => run("verify", () => verificationAction("verify", info.pageId))}
            >
              {state === "unverified" ? t("Mark as verified") : t("Verify again")}
            </Button>
          )}
          {isQms && (state === "draft" || state === "rejected") && p.canRequest && (
            <Button
              loading={busy === "request"}
              onClick={() => run("request", () => verificationAction("request", info.pageId))}
            >
              {state === "rejected" ? t("Submit again") : t("Submit for approval")}
            </Button>
          )}
          {isQms && state === "in_approval" && p.canVerify && (
            <>
              <Button
                color="green"
                loading={busy === "approve"}
                onClick={() => run("approve", () => verificationAction("approve", info.pageId))}
              >
                {t("Approve")}
              </Button>
              <Button color="red" variant="light" onClick={() => setRejecting(true)}>
                {t("Return for revision")}
              </Button>
            </>
          )}
          {canWithdraw && (
            <Button
              variant="default"
              loading={busy === "withdraw"}
              onClick={() => run("withdraw", () => verificationAction("withdraw", info.pageId))}
            >
              {t("Withdraw")}
            </Button>
          )}
        </Group>
      )}

      {p.canManage && !rejecting && (
        <Group justify="space-between" pt="xs" style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}>
          <Button variant="subtle" size="compact-sm" onClick={onEdit}>
            {t("Change settings")}
          </Button>
          <Button variant="subtle" color="red" size="compact-sm" onClick={remove}>
            {t("Remove review")}
          </Button>
        </Group>
      )}
    </Stack>
  );
}
