// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Bereitet das reine HTML für den PDF-Druck auf: Formeln mit KaTeX, Datum lesbar,
// Status als farbiges Label, Reiter-Titel als Zwischenüberschrift.
import { formatDateLabel } from "@docmost/editor-ext";
import { renderKatex } from "../editor/math-view";

const STATUS_BG: Record<string, string> = {
  gray: "rgb(223 223 215)",
  blue: "rgb(191 227 253)",
  green: "rgb(187 240 173)",
  yellow: "rgb(249 238 148)",
  red: "rgb(255 200 195)",
  purple: "rgb(225 207 245)",
};

export function decorateForPrint(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[data-type="mathInline"], [data-type="mathBlock"]').forEach((el) => {
    const block = el.dataset.type === "mathBlock";
    const { html, error } = renderKatex(el.textContent ?? "", block);
    if (html && !error) el.innerHTML = html;
    if (block) el.style.textAlign = "center";
  });
  root.querySelectorAll<HTMLElement>('time[data-type="date"]').forEach((el) => {
    el.textContent = formatDateLabel(el.getAttribute("datetime"), "de-DE");
  });
  root.querySelectorAll<HTMLElement>('span[data-type="status"]').forEach((el) => {
    el.style.cssText = `background:${STATUS_BG[el.dataset.color ?? "gray"] ?? STATUS_BG.gray};border-radius:3px;padding:1px 6px;font-size:11px;font-weight:700;text-transform:uppercase;`;
  });
  root.querySelectorAll<HTMLElement>('[data-type="tabLabel"]').forEach((el) => {
    el.style.cssText = "display:block;font-weight:600;margin:0.75em 0 0.25em;";
  });
}
