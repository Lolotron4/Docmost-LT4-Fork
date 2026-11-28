// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { ModalsProvider } from "@mantine/modals";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
// Gleiches Aussehen wie die Web-Version: Theme und Editor-Styles direkt aus apps/client.
import "../../client/src/features/editor/styles/index.css";
import { mantineCssResolver, theme } from "../../client/src/theme";
import "./styles.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={theme} cssVariablesResolver={mantineCssResolver} defaultColorScheme="auto">
    <ModalsProvider>
      <Notifications position="bottom-right" />
      <App />
    </ModalsProvider>
  </MantineProvider>,
);
