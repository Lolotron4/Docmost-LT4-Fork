// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
/**
 * Liest einen Confluence-HTML-Export (Space-Export als ZIP, Format "HTML")
 * und wandelt die Confluence-spezifischen Makros in Docmost-HTML um.
 *
 * Aufbau eines solchen Exports:
 *   <SPACEKEY>/index.html             Übersicht mit Seitenbaum ("Available Pages")
 *   <SPACEKEY>/Seitentitel_12345.html eine Datei pro Seite (Cloud: Titel_ID, Server oft nur ID)
 *   <SPACEKEY>/attachments/<seitenId>/<anhangId>[.ext]
 *   <SPACEKEY>/images/…, styles/…     Symbole und CSS von Confluence (werden ignoriert)
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import { Cheerio, CheerioAPI, load } from 'cheerio';
import { parseConfluenceEmojiId } from '../../integrations/import/utils/confluence-emoji';

export interface ConfluenceAttachment {
  /** Pfad relativ zum Entpack-Ordner (z. B. "TEAM/attachments/123/456.png"). */
  href: string;
  fileName: string;
  mimeType: string;
}

export interface ConfluencePage {
  /** Pfad der HTML-Datei relativ zum Entpack-Ordner. */
  filePath: string;
  confluenceId: string | null;
  title: string;
  parentFilePath: string | null;
  /** Reihenfolge unter den Geschwistern (aus dem Seitenbaum). */
  order: number;
  attachments: ConfluenceAttachment[];
}

export interface ConfluenceSpace {
  dir: string;
  name: string;
  pages: ConfluencePage[];
}

const IGNORED_DIRS = new Set(['images', 'styles', 'attachments', 'download']);

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

async function collectHtmlFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (IGNORED_DIRS.has(ent.name.toLowerCase())) continue;
        if (ent.name === '__MACOSX') continue;
        await walk(abs);
      } else if (/\.html?$/i.test(ent.name)) {
        out.push(toPosix(path.relative(root, abs)));
      }
    }
  }
  await walk(root);
  return out;
}

export function confluenceIdFromFileName(fileName: string): string | null {
  const base = path.basename(fileName).replace(/\.html?$/i, '');
  const m = base.match(/(?:^|_)(\d+)$/);
  return m ? m[1] : null;
}

function cleanText(text: string): string {
  return text.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

function titleFromFileName(fileName: string): string {
  const base = path.basename(fileName).replace(/\.html?$/i, '');
  const withoutId = base.replace(/_\d+$/, '');
  if (/^\d+$/.test(withoutId)) return withoutId;
  return withoutId.replace(/[-_]+/g, ' ').trim() || base;
}

/** Erkennt, ob ein entpackter Ordner wie ein Confluence-HTML-Export aussieht. */
export function looksLikeConfluencePage($: CheerioAPI): boolean {
  return (
    $('#main-content').length > 0 ||
    $('#title-text').length > 0 ||
    $('meta[name="confluence-request-time"]').length > 0 ||
    $('.wiki-content').length > 0
  );
}

function parseSpaceName($index: CheerioAPI | null, dir: string): string {
  if ($index) {
    const crumb = cleanText($index('#breadcrumbs li').first().text());
    if (crumb) return crumb;
    const title = cleanText($index('#title-text').text());
    if (title) return title.replace(/\s*:\s*Home$/i, '').trim() || title;
    const docTitle = cleanText($index('title').text());
    if (docTitle) return docTitle;
  }
  return path.basename(dir) || 'Confluence';
}

function parsePageTitle($: CheerioAPI, spaceName: string, fileName: string): string {
  let title = cleanText($('#title-text').text());
  if (!title) title = cleanText($('title').text());
  if (title) {
    const prefix = `${spaceName} : `;
    if (spaceName && title.startsWith(prefix)) {
      title = title.slice(prefix.length).trim();
    } else if (title.includes(' : ')) {
      title = title.slice(title.indexOf(' : ') + 3).trim();
    }
  }
  return title || titleFromFileName(fileName);
}

function parseAttachments(
  $: CheerioAPI,
  pageDir: string,
): ConfluenceAttachment[] {
  const result: ConfluenceAttachment[] = [];
  const seen = new Set<string>();
  const $section = $('#attachments')
    .closest('.pageSection')
    .add($('h2.pageSectionTitle')
      .filter((_, el) => /attachments/i.test($(el).text()))
      .closest('.pageSection'));

  $section.find('a[href]').each((_, el) => {
    const $a = $(el);
    const raw = ($a.attr('href') || '').split('#')[0].split('?')[0];
    if (!raw || /^[a-z]+:/i.test(raw)) return;
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      /* roh behalten */
    }
    if (!/(^|\/)attachments\//.test(decoded)) return;
    const href = toPosix(path.normalize(path.join(pageDir, decoded)));
    if (seen.has(href)) return;
    seen.add(href);

    const fileName = cleanText($a.text()) || path.basename(decoded);
    // Hinter dem Link steht der MIME-Typ in Klammern: "bild.png (image/png)"
    const after = ($a.get(0)?.next as any)?.data ?? '';
    const mime = String(after).match(/\(([^)]+)\)/)?.[1]?.trim() ?? '';
    result.push({ href, fileName, mimeType: mime });
  });
  return result;
}

interface TreeEntry {
  filePath: string;
  parentFilePath: string | null;
  order: number;
}

function parseIndexTree($: CheerioAPI, dir: string): Map<string, TreeEntry> {
  const tree = new Map<string, TreeEntry>();
  let $rootList: Cheerio<any> | null = null;

  $('h2, h3').each((_, el) => {
    if ($rootList) return;
    if (/available pages|verfügbare seiten|pages/i.test($(el).text())) {
      const $section = $(el).closest('.pageSection');
      const $ul = ($section.length ? $section : $(el).parent()).find('ul').first();
      if ($ul.length) $rootList = $ul;
    }
  });

  if (!$rootList) return tree;

  const walk = ($ul: Cheerio<any>, parent: string | null) => {
    let order = 0;
    $ul.children('li').each((_, li) => {
      const $li = $(li);
      const $a = $li.children('a[href]').first().length
        ? $li.children('a[href]').first()
        : $li.find('a[href]').first();
      let current: string | null = null;
      const href = ($a.attr('href') || '').split('#')[0];
      if (href && /\.html?$/i.test(href) && !/^[a-z]+:/i.test(href)) {
        let decoded = href;
        try {
          decoded = decodeURIComponent(href);
        } catch {
          /* roh */
        }
        current = toPosix(path.normalize(path.join(dir, decoded)));
        if (!tree.has(current)) {
          tree.set(current, { filePath: current, parentFilePath: parent, order: order++ });
        }
      }
      $li.children('ul').each((__, sub) => walk($(sub), current ?? parent));
    });
  };
  walk($rootList, null);
  return tree;
}

/**
 * Durchsucht den entpackten Export und liefert alle Bereiche mit ihren Seiten.
 * Wirft einen Fehler, wenn nichts nach Confluence aussieht.
 */
export async function scanConfluenceExport(
  extractDir: string,
): Promise<ConfluenceSpace[]> {
  const htmlFiles = await collectHtmlFiles(extractDir);
  const byDir = new Map<string, string[]>();
  for (const f of htmlFiles) {
    const dir = path.posix.dirname(f);
    const list = byDir.get(dir) ?? [];
    list.push(f);
    byDir.set(dir, list);
  }

  const spaces: ConfluenceSpace[] = [];

  for (const [dir, files] of byDir) {
    const indexFile = files.find((f) => /(^|\/)index\.html?$/i.test(f)) ?? null;
    let $index: CheerioAPI | null = null;
    if (indexFile) {
      $index = load(await fs.readFile(path.join(extractDir, indexFile), 'utf-8'));
    }

    const spaceName = parseSpaceName($index, dir === '.' ? '' : dir);
    const tree = $index ? parseIndexTree($index, dir === '.' ? '' : dir) : new Map();

    const pages: ConfluencePage[] = [];
    const breadcrumbParents = new Map<string, string | null>();

    for (const file of files) {
      if (file === indexFile) continue;
      const html = await fs.readFile(path.join(extractDir, file), 'utf-8');
      const $ = load(html);
      if (!looksLikeConfluencePage($)) continue;

      const pageDir = path.posix.dirname(file);
      const crumbs: string[] = [];
      $('#breadcrumbs a[href]').each((_, a) => {
        const href = ($(a).attr('href') || '').split('#')[0];
        if (!href || /^[a-z]+:/i.test(href) || /(^|\/)index\.html?$/i.test(href)) return;
        if (!/\.html?$/i.test(href)) return;
        let decoded = href;
        try {
          decoded = decodeURIComponent(href);
        } catch {
          /* roh */
        }
        crumbs.push(toPosix(path.normalize(path.join(pageDir, decoded))));
      });
      breadcrumbParents.set(file, crumbs.length ? crumbs[crumbs.length - 1] : null);

      pages.push({
        filePath: file,
        confluenceId: confluenceIdFromFileName(file),
        title: parsePageTitle($, spaceName, file),
        parentFilePath: null,
        order: Number.MAX_SAFE_INTEGER,
        attachments: parseAttachments($, pageDir),
      });
    }

    if (!pages.length) continue;

    const known = new Set(pages.map((p) => p.filePath));
    for (const page of pages) {
      const entry = tree.get(page.filePath);
      if (entry) {
        page.parentFilePath =
          entry.parentFilePath && known.has(entry.parentFilePath)
            ? entry.parentFilePath
            : null;
        page.order = entry.order;
      } else {
        const crumbParent = breadcrumbParents.get(page.filePath);
        page.parentFilePath =
          crumbParent && known.has(crumbParent) && crumbParent !== page.filePath
            ? crumbParent
            : null;
      }
    }

    // Zyklen vermeiden (kaputte Exporte): jede Kette höchstens bis zur Wurzel verfolgen
    const byPath = new Map(pages.map((p) => [p.filePath, p]));
    for (const page of pages) {
      const visited = new Set<string>([page.filePath]);
      let cur = page.parentFilePath;
      while (cur) {
        if (visited.has(cur)) {
          page.parentFilePath = null;
          break;
        }
        visited.add(cur);
        cur = byPath.get(cur)?.parentFilePath ?? null;
      }
    }

    spaces.push({ dir: dir === '.' ? '' : dir, name: spaceName, pages });
  }

  return spaces;
}

// ---------------------------------------------------------------------------
// Inhalt umwandeln
// ---------------------------------------------------------------------------

const CALLOUT_BY_MACRO: Record<string, string> = {
  information: 'info',
  info: 'info',
  note: 'warning',
  tip: 'success',
  warning: 'danger',
};

const STATUS_COLORS: Record<string, string> = {
  success: 'green',
  error: 'red',
  current: 'yellow',
  complete: 'blue',
  progress: 'blue',
  new: 'purple',
  moved: 'yellow',
};

const LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  jscript: 'javascript',
  javascript: 'javascript',
  ts: 'typescript',
  typescript: 'typescript',
  py: 'python',
  python: 'python',
  sh: 'bash',
  shell: 'bash',
  bash: 'bash',
  powershell: 'powershell',
  ps: 'powershell',
  csharp: 'csharp',
  'c#': 'csharp',
  cpp: 'cpp',
  'c++': 'cpp',
  c: 'c',
  java: 'java',
  xml: 'xml',
  html: 'xml',
  xhtml: 'xml',
  css: 'css',
  sql: 'sql',
  php: 'php',
  ruby: 'ruby',
  rb: 'ruby',
  perl: 'perl',
  go: 'go',
  yaml: 'yaml',
  yml: 'yaml',
  json: 'json',
  kotlin: 'kotlin',
  scala: 'scala',
  swift: 'swift',
  groovy: 'groovy',
  diff: 'diff',
  patch: 'diff',
  text: 'plaintext',
  none: 'plaintext',
  plain: 'plaintext',
};

function codeLanguage(params: string | undefined): string {
  if (!params) return '';
  const brush = params.match(/brush:\s*([^;]+)/i)?.[1]?.trim().toLowerCase();
  if (!brush) return '';
  return LANGUAGE_ALIASES[brush] ?? brush;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const COLUMN_LAYOUTS: Record<number, string> = {
  2: 'two_equal',
  3: 'three_equal',
  4: 'four_equal',
  5: 'five_equal',
};

function columnLayoutFor(confluenceLayout: string | undefined, count: number): string {
  switch (confluenceLayout) {
    case 'two-left-sidebar':
      return 'two_left_sidebar';
    case 'two-right-sidebar':
      return 'two_right_sidebar';
    case 'three-with-sidebars':
      return 'three_with_sidebars';
    default:
      return COLUMN_LAYOUTS[count] ?? 'two_equal';
  }
}

export interface ConfluenceLinkContext {
  /** Pfad der aktuellen Seite relativ zum Entpack-Ordner. */
  currentFilePath: string;
  /** Confluence-Seiten-ID → Dateipfad. */
  pageFileById: Map<string, string>;
  /** Seitentitel (klein geschrieben) → Dateipfad, für /display/KEY/Titel-Links. */
  pageFileByTitle: Map<string, string>;
}

function relativeTo(fromFile: string, toFile: string): string {
  const rel = path.posix.relative(path.posix.dirname(fromFile), toFile);
  return rel || path.posix.basename(toFile);
}

/**
 * Biegt Confluence-Links (absolute Wiki-URLs, viewpage.action, display/…)
 * auf die exportierte Seitendatei um, damit der Docmost-Import daraus
 * interne Links bzw. Erwähnungen macht.
 */
function rewriteConfluenceLinks(
  $: CheerioAPI,
  $root: Cheerio<any>,
  ctx: ConfluenceLinkContext,
) {
  $root.find('a[href]').each((_, el) => {
    const $a = $(el);
    const href = ($a.attr('href') || '').trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:')) return;

    let target: string | null = null;

    const byPageId =
      href.match(/\/pages\/(\d+)(?:[/?#]|$)/) ||
      href.match(/[?&]pageId=(\d+)/);
    if (byPageId) {
      target = ctx.pageFileById.get(byPageId[1]) ?? null;
    }

    if (!target) {
      const display = href.match(/\/display\/[^/]+\/([^?#]+)/);
      if (display) {
        let title = display[1];
        try {
          title = decodeURIComponent(title.replace(/\+/g, ' '));
        } catch {
          /* roh */
        }
        target = ctx.pageFileByTitle.get(cleanText(title).toLowerCase()) ?? null;
      }
    }

    if (!target && !/^[a-z]+:/i.test(href) && /\.html?(#.*)?$/i.test(href)) {
      // relativer Link auf eine andere Exportseite: Anker abschneiden
      const withoutHash = href.split('#')[0];
      if (withoutHash !== href) $a.attr('href', withoutHash);
      return;
    }

    if (target) {
      $a.attr('href', encodeURI(relativeTo(ctx.currentFilePath, target)));
    }
  });
}

function convertTaskList($: CheerioAPI, $ul: Cheerio<any>) {
  const $new = $('<ul>').attr('data-type', 'taskList');
  $ul.children('li').each((_, li) => {
    const $li = $(li);
    const checked = $li.hasClass('checked') || $li.attr('data-inline-task-status') === 'complete';
    const $nested = $li.children('ul, ol').remove();
    const inner = $li.html()?.trim() || '';
    const $item = $('<li>')
      .attr('data-type', 'taskItem')
      .attr('data-checked', String(checked));
    const $label = $('<label>').append(
      checked ? $('<input type="checkbox" checked>') : $('<input type="checkbox">'),
      $('<span>'),
    );
    const $container = $('<div>').append(`<p>${inner}</p>`);
    $nested.each((__, n) => {
      $container.append(n);
    });
    $item.append($label, $container);
    $new.append($item);
  });
  $ul.replaceWith($new);
}

/**
 * Wandelt den Inhalt einer Confluence-Seite (HTML-Export) in HTML um, das der
 * Docmost-Import versteht. Gibt nur den Seiteninhalt zurück (ohne Titel,
 * Brotkrumen, Metadaten und Anhangsliste).
 */
export function convertConfluencePageHtml(
  html: string,
  ctx: ConfluenceLinkContext,
): { html: string; referencedPaths: Set<string> } {
  const $ = load(html);
  let $content = $('#main-content');
  if (!$content.length) $content = $('.wiki-content').first();
  if (!$content.length) $content = $('body');
  const $root = $content;

  // Unnötiges entfernen
  $root.find('script, style, .toc-macro, .rbtoc, span.confluence-anchor-link, .plugin_attachments_container .attachments-drop-zone').remove();

  // Unterseiten-Makros → Docmost-Unterseitenblock
  $root.find('.plugin_pagetree, ul.childpages-macro, .children-show-hide').each((_, el) => {
    $(el).replaceWith('<div data-type="subpages"></div>');
  });

  // Tabellen-Wrapper entfernen
  $root.find('div.table-wrap').each((_, el) => {
    $(el).replaceWith($(el).contents());
  });

  // Bilder: eingebettete Dateien auspacken, Originaldatei statt Vorschaubild
  $root.find('span.confluence-embedded-file-wrapper').each((_, el) => {
    $(el).replaceWith($(el).contents());
  });
  $root.find('img').each((_, el) => {
    const $img = $(el);
    const original = $img.attr('data-image-src');
    const src = $img.attr('src') || '';
    if (original && !/^[a-z]+:/i.test(original) && (!src || /thumbnails\//.test(src) || !/^[a-z]+:/i.test(src))) {
      $img.attr('src', original);
    }
    if ($img.attr('data-width') && !$img.attr('width')) {
      $img.attr('width', $img.attr('data-width')!);
    }
  });

  // Emoticons → Emoji-Text
  $root.find('img.emoticon').each((_, el) => {
    const $img = $(el);
    const emoji =
      $img.attr('data-emoji-fallback') ||
      parseConfluenceEmojiId($img.attr('data-emoji-id')) ||
      $img.attr('alt') ||
      '';
    $img.replaceWith(emoji ? escapeHtml(emoji) : '');
  });

  // Personen-Links → einfacher Text
  $root.find('a.confluence-userlink, a.user-mention').each((_, el) => {
    const name = cleanText($(el).text());
    $(el).replaceWith(name ? `@${escapeHtml(name.replace(/^@/, ''))}` : '');
  });

  // Codeblöcke
  $root.find('pre.syntaxhighlighter-pre, pre[data-syntaxhighlighter-params]').each((_, el) => {
    const $pre = $(el);
    const lang = codeLanguage($pre.attr('data-syntaxhighlighter-params'));
    const $panel = $pre.closest('div.code');
    const title = cleanText($panel.find('.codeHeader').first().text());
    const code = $pre.text();
    const cls = lang ? ` class="language-${lang}"` : '';
    const block = `${title ? `<p><strong>${escapeHtml(title)}</strong></p>` : ''}<pre><code${cls}>${escapeHtml(code)}</code></pre>`;
    if ($panel.length) $panel.replaceWith(block);
    else $pre.replaceWith(block);
  });
  $root.find('div.preformatted').each((_, el) => {
    const code = $(el).find('pre').text();
    $(el).replaceWith(`<pre><code>${escapeHtml(code)}</code></pre>`);
  });

  // Info/Hinweis/Tipp/Warnung → Callout (von innen nach außen)
  $root
    .find('div.confluence-information-macro')
    .get()
    .reverse()
    .forEach((el) => {
      const $m = $(el);
      const cls = $m.attr('class') || '';
      const kind = cls.match(/confluence-information-macro-(information|info|note|tip|warning)/)?.[1] ?? 'information';
      const type = CALLOUT_BY_MACRO[kind] ?? 'info';
      const title = cleanText($m.children('.title, p.title').first().text());
      const $body = $m.children('.confluence-information-macro-body');
      const $callout = $('<div>').attr('data-type', 'callout').attr('data-callout-type', type);
      if (title) $callout.append(`<p><strong>${escapeHtml(title)}</strong></p>`);
      $callout.append(($body.length ? $body : $m).html() || '');
      $callout.find('.confluence-information-macro-icon').remove();
      $m.replaceWith($callout);
    });

  // Allgemeines Panel-Makro → neutraler Callout
  $root
    .find('div.panel')
    .get()
    .reverse()
    .forEach((el) => {
      const $p = $(el);
      if ($p.hasClass('code')) return;
      const title = cleanText($p.children('.panelHeader').first().text());
      const $body = $p.children('.panelContent');
      const $callout = $('<div>').attr('data-type', 'callout').attr('data-callout-type', 'note');
      if (title) $callout.append(`<p><strong>${escapeHtml(title)}</strong></p>`);
      $callout.append(($body.length ? $body : $p).html() || '');
      $p.replaceWith($callout);
    });

  // Aufklapper (Expand-Makro) → Details
  $root
    .find('div.expand-container')
    .get()
    .reverse()
    .forEach((el) => {
      const $e = $(el);
      const summary =
        cleanText($e.find('.expand-control-text').first().text()) || 'Details';
      const content = $e.children('.expand-content').html() || '';
      $e.replaceWith(
        `<details><summary>${escapeHtml(summary)}</summary><div data-type="detailsContent">${content || '<p></p>'}</div></details>`,
      );
    });

  // Status-Lozenges → Status
  $root.find('span.status-macro, span.aui-lozenge').each((_, el) => {
    const $s = $(el);
    const cls = $s.attr('class') || '';
    const key = cls.match(/aui-lozenge-(success|error|current|complete|progress|new|moved)/)?.[1];
    const color = (key && STATUS_COLORS[key]) || 'gray';
    const text = cleanText($s.text());
    $s.replaceWith(`<span data-type="status" data-color="${color}">${escapeHtml(text)}</span>`);
  });

  // Aufgabenlisten (von innen nach außen, damit verschachtelte Listen mitkommen)
  $root
    .find('ul.inline-task-list')
    .get()
    .reverse()
    .forEach((el) => convertTaskList($, $(el)));

  // Spalten-Layouts
  $root.find('div.columnLayout').each((_, el) => {
    const $layout = $(el);
    const $cells = $layout.children('div.cell');
    if ($cells.length <= 1) {
      const $inner = $cells.children('.innerCell');
      $layout.replaceWith(($inner.length ? $inner : $cells).html() || '');
      return;
    }
    const layout = columnLayoutFor($layout.attr('data-layout'), $cells.length);
    let cols = '';
    $cells.each((__, cell) => {
      const $inner = $(cell).children('.innerCell');
      cols += `<div data-type="column">${($inner.length ? $inner : $(cell)).html() || '<p></p>'}</div>`;
    });
    $layout.replaceWith(`<div data-type="columns" data-layout="${layout}">${cols}</div>`);
  });
  $root.find('div.contentLayout2, div.contentLayout').each((_, el) => {
    $(el).replaceWith($(el).contents());
  });

  rewriteConfluenceLinks($, $root, ctx);

  // Welche Anhänge werden im Text schon benutzt?
  const pageDir = path.posix.dirname(ctx.currentFilePath);
  const referencedPaths = new Set<string>();
  $root.find('img[src], a[href], video[src], audio[src]').each((_, el) => {
    const raw = $(el).attr('src') || $(el).attr('href') || '';
    if (!raw || /^[a-z]+:/i.test(raw)) return;
    let decoded = raw.split('#')[0].split('?')[0];
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      /* roh */
    }
    decoded = decoded.replace(/^\/?download\/attachments\//, 'attachments/');
    referencedPaths.add(toPosix(path.posix.normalize(path.posix.join(pageDir, decoded))));
  });

  return { html: $root.html() || '', referencedPaths };
}

/**
 * Hängt Anhänge, die im Seitentext nicht vorkommen, als Liste unten an,
 * damit keine Datei beim Import verloren geht.
 */
export function appendUnreferencedAttachments(
  html: string,
  page: ConfluencePage,
  referencedPaths: Set<string>,
): string {
  const pageDir = path.posix.dirname(page.filePath);
  const drawioBases = new Set(
    page.attachments
      .filter((a) => a.mimeType === 'application/vnd.jgraph.mxfile' || /\.drawio$/i.test(a.fileName))
      .map((a) => a.fileName.replace(/\.drawio$/i, '')),
  );

  const missing = page.attachments.filter((a) => {
    if (referencedPaths.has(a.href)) return false;
    if (a.fileName.endsWith('.tmp') || a.fileName.includes('~drawio~')) return false;
    // Vorschaubild eines draw.io-Diagramms: kommt mit dem Diagramm zusammen
    const pngBase = a.fileName.replace(/(\.drawio)?\.png$/i, '');
    if (/\.png$/i.test(a.fileName) && drawioBases.has(pngBase)) return false;
    return true;
  });
  if (!missing.length) return html;

  const items = missing
    .map((a) => {
      const rel = path.posix.relative(pageDir, a.href);
      const href = rel.split('/').map(encodeURIComponent).join('/');
      const isImage =
        a.mimeType.startsWith('image/') ||
        /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(a.fileName);
      if (isImage) {
        return `<img src="${href}" alt="${escapeHtml(a.fileName).replace(/"/g, '&quot;')}">`;
      }
      return `<p><a href="${href}" data-linked-resource-default-alias="${escapeHtml(a.fileName).replace(/"/g, '&quot;')}">${escapeHtml(a.fileName)}</a></p>`;
    })
    .join('');
  return `${html}<h3>Anhänge</h3>${items}`;
}
