// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import { useMemo, useState } from "react";
import {
  ActionIcon,
  Box,
  Group,
  Menu,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconChevronDown,
  IconChevronRight,
  IconDots,
  IconFileText,
  IconPlus,
  IconSearch,
  IconTable,
} from "@tabler/icons-react";
import { NewBaseItems } from "../base/base-page";
import { baseToRows } from "../base/base-export";
import { readBase } from "../base/local-base";
import { childrenOf, descendants, loadDoc, useStore } from "../lib/store";
import type { PageMeta, Space } from "../lib/types";

function docText(node: any): string {
  if (!node) return "";
  if (typeof node.text === "string") return node.text;
  return Array.isArray(node.content) ? node.content.map(docText).join(" ") : "";
}

function askName(title: string, initial: string, onOk: (v: string) => void) {
  let value = initial;
  modals.openConfirmModal({
    title,
    centered: true,
    labels: { confirm: "Speichern", cancel: "Abbrechen" },
    children: (
      <TextInput
        data-autofocus
        defaultValue={initial}
        onChange={(e) => (value = e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onOk(value);
            modals.closeAll();
          }
        }}
      />
    ),
    onConfirm: () => onOk(value),
  });
}

function PageNode({
  page,
  depth,
  selectedId,
  onSelect,
}: {
  page: PageMeta;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const store = useStore();
  const kids = childrenOf(store.state.pages, page.spaceId, page.id);
  const [open, setOpen] = useState(true);
  const selected = selectedId === page.id;

  const blocked = new Set([page.id, ...descendants(store.state.pages, page.id)]);
  const others = store.state.pages.filter((p) => p.spaceId === page.spaceId && !blocked.has(p.id));

  return (
    <>
      <Group
        gap={2}
        wrap="nowrap"
        className="lt4-tree-row"
        data-selected={selected || undefined}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        <ActionIcon
          size="xs"
          variant="transparent"
          color="gray"
          aria-label={open ? "Zuklappen" : "Aufklappen"}
          style={{ visibility: kids.length ? "visible" : "hidden" }}
          onClick={() => setOpen(!open)}
        >
          {open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
        </ActionIcon>
        <UnstyledButton className="lt4-tree-label" onClick={() => onSelect(page.id)}>
          <Group gap={6} wrap="nowrap">
            {page.icon ? <span>{page.icon}</span> : page.isBase ? <IconTable size={15} /> : <IconFileText size={15} />}
            <Text size="sm" truncate>
              {page.title || "Unbenannt"}
            </Text>
          </Group>
        </UnstyledButton>
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon size="sm" variant="subtle" color="gray" className="lt4-tree-more" aria-label="Seitenmenü">
              <IconDots size={14} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconPlus size={14} />}
              onClick={() => {
                const p = store.createPage(page.spaceId, page.id);
                setOpen(true);
                onSelect(p.id);
              }}
            >
              Unterseite anlegen
            </Menu.Item>
            <Menu.Sub>
              <Menu.Sub.Target>
                <Menu.Sub.Item leftSection={<IconTable size={14} />}>Datenbank darunter anlegen</Menu.Sub.Item>
              </Menu.Sub.Target>
              <Menu.Sub.Dropdown>
                <NewBaseItems
                  onPick={async (t) => {
                    const p = await store.createBase(page.spaceId, page.id, t);
                    setOpen(true);
                    onSelect(p.id);
                  }}
                />
              </Menu.Sub.Dropdown>
            </Menu.Sub>
            <Menu.Sub>
              <Menu.Sub.Target>
                <Menu.Sub.Item>Verschieben unter …</Menu.Sub.Item>
              </Menu.Sub.Target>
              <Menu.Sub.Dropdown mah={300} style={{ overflowY: "auto" }}>
                <Menu.Item onClick={() => store.movePage(page.id, null)}>(oberste Ebene)</Menu.Item>
                {others.map((o) => (
                  <Menu.Item key={o.id} onClick={() => store.movePage(page.id, o.id)}>
                    {o.title || "Unbenannt"}
                  </Menu.Item>
                ))}
              </Menu.Sub.Dropdown>
            </Menu.Sub>
            <Menu.Divider />
            <Menu.Item
              color="red"
              onClick={() =>
                modals.openConfirmModal({
                  title: "Seite löschen?",
                  centered: true,
                  children: (
                    <Text size="sm">
                      „{page.title || "Unbenannt"}“
                      {kids.length ? " und alle Unterseiten werden" : " wird"} dauerhaft von diesem Gerät gelöscht.
                    </Text>
                  ),
                  labels: { confirm: "Löschen", cancel: "Abbrechen" },
                  confirmProps: { color: "red" },
                  onConfirm: () => store.deletePage(page.id),
                })
              }
            >
              Löschen
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      {open &&
        kids.map((k) => (
          <PageNode key={k.id} page={k} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
        ))}
    </>
  );
}

function SpaceBlock({
  space,
  selectedId,
  onSelect,
}: {
  space: Space;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const store = useStore();
  const roots = childrenOf(store.state.pages, space.id, null);
  return (
    <Stack gap={0} mb="sm">
      <Group justify="space-between" wrap="nowrap" px={6} py={2}>
        <Text size="xs" fw={700} c="dimmed" tt="uppercase" truncate>
          {space.name}
        </Text>
        <Group gap={0} wrap="nowrap">
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            aria-label={`Neue Seite in ${space.name}`}
            onClick={() => onSelect(store.createPage(space.id, null).id)}
          >
            <IconPlus size={14} />
          </ActionIcon>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Bereichsmenü">
                <IconDots size={14} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => askName("Bereich umbenennen", space.name, (v) => store.renameSpace(space.id, v))}>
                Umbenennen
              </Menu.Item>
              <Menu.Item
                color="red"
                onClick={() =>
                  modals.openConfirmModal({
                    title: "Bereich löschen?",
                    centered: true,
                    children: (
                      <Text size="sm">
                        „{space.name}“ mit {store.state.pages.filter((p) => p.spaceId === space.id).length} Seiten wird
                        dauerhaft von diesem Gerät gelöscht.
                      </Text>
                    ),
                    labels: { confirm: "Löschen", cancel: "Abbrechen" },
                    confirmProps: { color: "red" },
                    onConfirm: () => store.deleteSpace(space.id),
                  })
                }
              >
                Löschen
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
      {roots.length === 0 && (
        <Text size="xs" c="dimmed" px={10}>
          Noch keine Seiten
        </Text>
      )}
      {roots.map((p) => (
        <PageNode key={p.id} page={p} depth={0} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </Stack>
  );
}

export function Sidebar({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const store = useStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PageMeta[] | null>(null);
  const [searching, setSearching] = useState(false);

  const runSearch = async (q: string) => {
    setQuery(q);
    const needle = q.trim().toLowerCase();
    if (!needle) return setResults(null);
    setSearching(true);
    const hits: PageMeta[] = [];
    for (const p of store.state.pages) {
      if ((p.title || "").toLowerCase().includes(needle)) {
        hits.push(p);
        continue;
      }
      const text = (
        p.isBase ? baseToRows(await readBase(p.id)).flat().join(" ") : docText(await loadDoc(p.id))
      ).toLowerCase();
      if (text.includes(needle)) hits.push(p);
    }
    setResults(hits);
    setSearching(false);
  };

  const spaceName = useMemo(
    () => new Map(store.state.spaces.map((s) => [s.id, s.name])),
    [store.state.spaces],
  );

  return (
    <Stack gap="xs" h="100%">
      <TextInput
        size="xs"
        placeholder="Suchen (auch offline)"
        leftSection={<IconSearch size={14} />}
        value={query}
        onChange={(e) => runSearch(e.currentTarget.value)}
      />
      <ScrollArea style={{ flex: 1 }} type="auto">
        {results ? (
          <Stack gap={2}>
            <Text size="xs" c="dimmed" px={6}>
              {searching ? "Suche läuft …" : `${results.length} Treffer`}
            </Text>
            {results.map((p) => (
              <UnstyledButton key={p.id} className="lt4-tree-row" px={8} py={4} onClick={() => onSelect(p.id)}>
                <Text size="sm" truncate>
                  {p.title || "Unbenannt"}
                </Text>
                <Text size="xs" c="dimmed" truncate>
                  {spaceName.get(p.spaceId)}
                </Text>
              </UnstyledButton>
            ))}
          </Stack>
        ) : (
          <Box>
            {store.state.spaces.map((s) => (
              <SpaceBlock key={s.id} space={s} selectedId={selectedId} onSelect={onSelect} />
            ))}
          </Box>
        )}
      </ScrollArea>
      <UnstyledButton
        className="lt4-tree-row"
        px={8}
        py={6}
        onClick={() => askName("Neuer Bereich", "", (v) => store.createSpace(v))}
      >
        <Group gap={6}>
          <IconPlus size={14} />
          <Text size="sm">Neuer Bereich</Text>
        </Group>
      </UnstyledButton>
    </Stack>
  );
}
