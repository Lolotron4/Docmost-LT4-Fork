// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { ModalsProvider } from "@mantine/modals";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/dates/styles.css";
import "dayjs/locale/de";
import { DatesProvider } from "@mantine/dates";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./i18n";
// Gleiches Aussehen wie die Web-Version: Theme und Editor-Styles direkt aus apps/client.
import "../../client/src/features/editor/styles/index.css";
import { mantineCssResolver, theme } from "../../client/src/theme";
import "./styles.css";
import App from "./App";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } },
});

createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={theme} cssVariablesResolver={mantineCssResolver} defaultColorScheme="auto">
    <QueryClientProvider client={queryClient}>
      <DatesProvider settings={{ locale: "de", firstDayOfWeek: 1 }}>
        <ModalsProvider>
          <Notifications position="bottom-right" />
          <App />
        </ModalsProvider>
      </DatesProvider>
    </QueryClientProvider>
  </MantineProvider>,
);
