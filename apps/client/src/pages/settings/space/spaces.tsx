import SettingsTitle from "@/components/settings/settings-title.tsx";
import SpaceList from "@/features/space/components/space-list.tsx";
import { Group } from "@mantine/core";
import CreateSpaceModal from "@/features/space/components/create-space-modal.tsx";
import { useTranslation } from "react-i18next";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { Navigate } from "react-router-dom";
import APP_ROUTE from "@/lib/app-route.ts";
import useCurrentUser from "@/features/user/hooks/use-current-user.ts";
import { fallbackPermissions } from "@/lt4/roles/role-permissions";

export default function Spaces() {
  const { t } = useTranslation();
  // role from the query: the stored user atom is still empty on a first visit
  const { data: currentUser } = useCurrentUser();
  const role = currentUser?.user?.role;
  // LT4-Fork: Recht "Bereiche verwalten" der (ggf. eigenen) Rolle
  const permissions =
    currentUser?.permissions ?? fallbackPermissions(role);

  if (role !== "owner" && !permissions.includes("spaces")) {
    return <Navigate to={APP_ROUTE.SPACES} replace />;
  }

  return (
    <>
      <DocumentTitle title={t("Spaces")} />
      <SettingsTitle title={t("Spaces")} />

      <Group my="md" justify="flex-end">
        <CreateSpaceModal />
      </Group>

      <SpaceList />
    </>
  );
}
