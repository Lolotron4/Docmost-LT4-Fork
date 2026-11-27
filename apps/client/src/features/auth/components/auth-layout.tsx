import React from "react";
import { Group } from "@mantine/core";
import { Lt4Brand } from "@/lt4/branding/lt4-brand.tsx";
import { MAIN_CONTENT_ID } from "@/components/ui/skip-to-main.tsx";
import AnnouncementBanners from "@/lt4/announcement/components/announcement-banners.tsx";
import classes from "./auth.module.css";

type AuthLayoutProps = {
  children: React.ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <>
      <AnnouncementBanners surface="public" />
      <Group justify="center" gap={8} className={classes.logo}>
        <img
          src="/icons/favicon-32x32.png"
          alt="LT4-Docs"
          width={22}
          height={22}
        />
        <Lt4Brand size="28px" fw={700} />
      </Group>
      <main id={MAIN_CONTENT_ID} tabIndex={-1}>{children}</main>
    </>
  );
}
