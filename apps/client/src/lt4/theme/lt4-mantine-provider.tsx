// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { ReactNode, useEffect, useMemo } from "react";
import { useAtomValue } from "jotai";
import { userAtom } from "@/features/user/atoms/current-user-atom";
import {
  CSSVariablesResolver,
  MantineProvider,
  MantineThemeOverride,
  mergeThemeOverrides,
} from "@mantine/core";
import { buildLt4ThemeOverride } from "./lt4-themes";
import { setLt4ThemeChoice, useLt4ThemeChoice } from "./lt4-theme-store";

interface Props {
  theme: MantineThemeOverride;
  cssVariablesResolver: CSSVariablesResolver;
  children: ReactNode;
}

/** MantineProvider, der das gewählte LT4-Theme (und eigene Akzentfarbe) anwendet. */
export function Lt4MantineProvider({
  theme,
  cssVariablesResolver,
  children,
}: Props) {
  const { preset, accent } = useLt4ThemeChoice();
  const user = useAtomValue(userAtom);
  const serverTheme = user?.settings?.preferences?.lt4Theme;
  const serverAccent = user?.settings?.preferences?.lt4Accent;

  // Die Auswahl wird am Konto gespeichert; lokal nur zwischengespeichert,
  // damit beim Laden nicht kurz das Standard-Theme aufblitzt.
  useEffect(() => {
    if (serverTheme === undefined && serverAccent === undefined) return;
    setLt4ThemeChoice({
      ...(serverTheme !== undefined && { preset: serverTheme }),
      ...(serverAccent !== undefined && { accent: serverAccent }),
    });
  }, [serverTheme, serverAccent]);
  const merged = useMemo(
    () => mergeThemeOverrides(theme, buildLt4ThemeOverride(preset, accent)),
    [theme, preset, accent],
  );

  return (
    <MantineProvider theme={merged} cssVariablesResolver={cssVariablesResolver}>
      {children}
    </MantineProvider>
  );
}
