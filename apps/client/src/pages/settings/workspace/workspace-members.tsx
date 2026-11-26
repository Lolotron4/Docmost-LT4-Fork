import WorkspaceInviteModal from "@/features/workspace/components/members/components/workspace-invite-modal";
import { Group, SegmentedControl, Space, Text } from "@mantine/core";
import WorkspaceMembersTable from "@/features/workspace/components/members/components/workspace-members-table";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import WorkspaceInvitesTable from "@/features/workspace/components/members/components/workspace-invites-table.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { JoinLinksPanel } from "@/lt4/accounts/components/join-links-panel";

export default function WorkspaceMembers() {
  const { t } = useTranslation();
  const [segmentValue, setSegmentValue] = useState("members");
  const [workspace] = useAtom(workspaceAtom);
  const [searchParams] = useSearchParams();
  const { can } = useUserRole();
  const isAdmin = can("members");
  const navigate = useNavigate();

  useEffect(() => {
    const currentTab = searchParams.get("tab");
    if (currentTab === "invites" || currentTab === "join-links") {
      setSegmentValue(currentTab);
    }
  }, [searchParams.get("tab")]);

  const handleSegmentChange = (value: string) => {
    setSegmentValue(value);
    if (value === "invites" || value === "join-links") {
      navigate(`?tab=${value}`);
    } else {
      navigate("");
    }
  };

  return (
    <>
      <DocumentTitle title={t("Members")} />
      <SettingsTitle title={t("Members")} />

      {/* <WorkspaceInviteSection /> */}
      {/* <Divider my="lg" /> */}

      <Group justify="space-between">
        <SegmentedControl
          value={segmentValue}
          onChange={handleSegmentChange}
          data={[
            {
              label: t("Members") + ` (${workspace?.memberCount})`,
              value: "members",
            },
            { label: t("Pending"), value: "invites" },
            ...(isAdmin ? [{ label: t("Join links"), value: "join-links" }] : []),
          ]}
          withItemsBorders={false}
        />

        {isAdmin && <WorkspaceInviteModal />}
      </Group>

      <Space h="lg" />

      {segmentValue === "join-links" && isAdmin ? (
        <JoinLinksPanel />
      ) : segmentValue === "invites" ? (
        <WorkspaceInvitesTable />
      ) : (
        <WorkspaceMembersTable />
      )}
    </>
  );
}
