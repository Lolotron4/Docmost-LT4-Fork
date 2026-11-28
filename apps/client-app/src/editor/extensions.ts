// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
/**
 * Editor-Erweiterungen des Clients. Die Knoten-Namen und Attribute stammen aus
 * @docmost/editor-ext bzw. Tiptap, damit Seiten beim Import auf dem Server
 * genau so aussehen wie hier (Farben, Infoboxen, Tabellen, Aufgaben ...).
 */
import { StarterKit } from "@tiptap/starter-kit";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { TaskList } from "@tiptap/extension-list";
import { Superscript } from "@tiptap/extension-superscript";
import { Subscript } from "@tiptap/extension-subscript";
import { Placeholder } from "@tiptap/extensions";
import { ReactNodeViewRenderer } from "@tiptap/react";
import {
  BaseEmbed,
  Callout,
  Column,
  Columns,
  DateNode,
  MathBlock,
  MathInline,
  Status,
  Tab,
  TabLabel,
  TabPanel,
  Tabs,
  Color,
  CustomTable,
  Details,
  DetailsContent,
  DetailsSummary,
  Heading,
  Highlight,
  Indent,
  LinkExtension,
  ListItem,
  TableCell,
  TableHeader,
  TableRow,
  TaskItem,
  TiptapImage,
} from "@docmost/editor-ext";
import CalloutView from "./callout-view";
import ImageView from "./image-view";
import DateView from "./date-view";
import { MathBlockView, MathInlineView } from "./math-view";
import StatusView from "./status-view";
import TabsView from "./tabs-view";
import BaseEmbedView from "./base-embed-view";

// Zellen erlauben im Server weitere Knoten (Video, Mathe ...), die der Client
// noch nicht kennt. Hier nur die vorhandenen, sonst baut ProseMirror kein Schema.
const CELL_CONTENT =
  "(paragraph | heading | bulletList | orderedList | taskList | blockquote | callout | image | details | codeBlock | mathBlock)+";
const ClientTableCell = TableCell.extend({ content: CELL_CONTENT });
const ClientTableHeader = TableHeader.extend({ content: CELL_CONTENT });

export function buildExtensions(opts: { placeholder?: string } = {}) {
  return [
    StarterKit.configure({
      heading: false,
      link: false,
      listItem: false,
      trailingNode: false,
      dropcursor: { width: 3, color: "#70CFF8" },
    }),
    Heading,
    ListItem,
    TaskList,
    TaskItem.configure({ nested: true }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Superscript,
    Subscript,
    Indent,
    LinkExtension.configure({ openOnClick: false }),
    CustomTable.configure({ resizable: true, allowTableNodeSelection: true }),
    TableRow,
    ClientTableHeader,
    ClientTableCell,
    Details,
    DetailsSummary,
    DetailsContent,
    Callout.configure({ view: CalloutView }),
    TiptapImage.configure({ view: ImageView, allowBase64: false }),
    Columns,
    Column,
    MathInline.configure({ view: MathInlineView }),
    MathBlock.configure({ view: MathBlockView }),
    Tabs.configure({ view: TabsView }),
    Tab,
    TabLabel,
    TabPanel,
    Status.configure({ view: StatusView }),
    BaseEmbed.extend({
      addNodeView() {
        return ReactNodeViewRenderer(BaseEmbedView, {
          // Klicks, Tastatur und Ziehen innerhalb der Datenbank nicht an den Editor geben
          stopEvent: () => true,
        });
      },
    }),
    DateNode.configure({ locale: () => "de-DE" }).extend({
      addNodeView() {
        return ReactNodeViewRenderer(DateView);
      },
    }),
    Placeholder.configure({
      placeholder: opts.placeholder ?? "Schreib los …",
      includeChildren: false,
    }),
  ];
}
