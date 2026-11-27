// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { createRoot } from "react-dom/client";
import { createTheme, MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { ModalsProvider } from "@mantine/modals";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./styles.css";
import App from "./App";

const theme = createTheme({ primaryColor: "blue", defaultRadius: "md" });

createRoot(document.getElementById("root")!).render(
  <MantineProvider theme={theme} defaultColorScheme="auto">
    <ModalsProvider>
      <Notifications position="bottom-right" />
      <App />
    </ModalsProvider>
  </MantineProvider>,
);
