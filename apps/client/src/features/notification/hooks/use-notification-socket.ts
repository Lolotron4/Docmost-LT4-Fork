import { useEffect } from "react";
import { useAtom } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
import { socketAtom } from "@/features/websocket/atoms/socket-atom";
import { NOTIFICATION_KEY } from "../queries/notification-query";
import { TASK_COUNTS_KEY, TASKS_KEY } from "@/lt4/tasks/task-service";

export function useNotificationSocket() {
  const queryClient = useQueryClient();
  const [socket] = useAtom(socketAtom);

  useEffect(() => {
    if (!socket) return;

    const handler = (payload?: { type?: string }) => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEY });
      // LT4: Aufgaben-Zähler aktualisieren
      if (payload?.type?.startsWith("lt4.task_")) {
        queryClient.invalidateQueries({ queryKey: [TASK_COUNTS_KEY] });
        queryClient.invalidateQueries({ queryKey: [TASKS_KEY] });
      }
    };

    socket.on("notification", handler);
    return () => {
      socket.off("notification", handler);
    };
  }, [socket, queryClient]);
}
