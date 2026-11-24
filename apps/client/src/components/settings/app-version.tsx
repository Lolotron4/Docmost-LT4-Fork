import { useAppVersion } from "@/features/workspace/queries/workspace-query.ts";
import { isCloud } from "@/lib/config.ts";
import classes from "@/components/settings/settings.module.css";
import { Indicator, Text, Tooltip } from "@mantine/core";
import React from "react";
import semverGt from "semver/functions/gt";
import { useTranslation } from "react-i18next";
import { LT4_REPO_URL, LT4_VERSION } from "@/lt4/version";

export default function AppVersion() {
  const { t } = useTranslation();
  const { data: appVersion } = useAppVersion(!isCloud());
  let hasUpdate = false;
  try {
    hasUpdate =
      appVersion &&
      parseFloat(appVersion.latestVersion) > 0 &&
      semverGt(appVersion.latestVersion, appVersion.currentVersion);
  } catch (err) {
    console.error(err);
  }

  return (
    <div className={classes.text}>
      <Tooltip
        label={t("{{latestVersion}} is available", {
          latestVersion: `v${appVersion?.latestVersion}`,
        })}
        disabled={!hasUpdate}
      >
        <Indicator
          label={t("New update")}
          color="gray"
          inline
          size={16}
          position="middle-end"
          style={{ cursor: "pointer" }}
          disabled={!hasUpdate}
          onClick={() => {
            window.open(
              "https://github.com/docmost/docmost/releases",
              "_blank",
            );
          }}
        >
          <Text
            size="sm"
            c="dimmed"
            component="a"
            mr={45}
            href="https://github.com/docmost/docmost/releases"
            target="_blank"
          >
            {appVersion?.currentVersion && <>Docmost v{appVersion?.currentVersion}</>}
          </Text>
        </Indicator>
      </Tooltip>
      {/* LT4-Fork: eigene Versionsnummer unter der Docmost-Version */}
      <Text
        size="xs"
        c="dimmed"
        component="a"
        href={LT4_REPO_URL}
        target="_blank"
        display="block"
      >
        LT4-Docs v{LT4_VERSION}
      </Text>
    </div>
  );
}
