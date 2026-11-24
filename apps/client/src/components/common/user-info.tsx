import { Group, Text } from "@mantine/core";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import React from "react";
import { IUser } from '@/features/user/types/user.types.ts';
import { displayEmail } from "@/lt4/accounts/username";

interface UserInfoProps {
  user: Partial<IUser>;
  size?: string;
}
export function UserInfo({ user, size }: UserInfoProps) {
  return (
    <Group gap="sm" wrap="nowrap">
      <CustomAvatar avatarUrl={user?.avatarUrl} name={user?.name} size={size} />
      <div>
        <Text fz="sm" fw={500} lineClamp={1}>
          {user?.name}
        </Text>
        <Text fz="xs" c="dimmed">
          {displayEmail(user?.email)}
        </Text>
      </div>
    </Group>
  );
}
