// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
import {
  appendUnreferencedAttachments,
  confluenceIdFromFileName,
  convertConfluencePageHtml,
} from './confluence-export';

const ctx = {
  currentFilePath: 'TEAM/Seite_1.html',
  pageFileById: new Map([['2', 'TEAM/Andere-Seite_2.html']]),
  pageFileByTitle: new Map([['andere seite', 'TEAM/Andere-Seite_2.html']]),
};

const wrap = (body: string) =>
  `<html><body><div id="main-content" class="wiki-content">${body}</div></body></html>`;

describe('Confluence-Export (LT4)', () => {
  it('liest die Seiten-ID aus dem Dateinamen', () => {
    expect(confluenceIdFromFileName('TEAM/Startseite_65538.html')).toBe('65538');
    expect(confluenceIdFromFileName('TEAM/65538.html')).toBe('65538');
    expect(confluenceIdFromFileName('TEAM/Startseite.html')).toBeNull();
  });

  it('wandelt Info-Makros in Callouts um', () => {
    const { html } = convertConfluencePageHtml(
      wrap(
        '<div class="confluence-information-macro confluence-information-macro-warning"><div class="confluence-information-macro-body"><p>Achtung</p></div></div>',
      ),
      ctx,
    );
    expect(html).toContain('data-type="callout"');
    expect(html).toContain('data-callout-type="danger"');
  });

  it('übernimmt Codeblöcke mit Sprache', () => {
    const { html } = convertConfluencePageHtml(
      wrap(
        '<div class="code panel"><div class="codeContent"><pre class="syntaxhighlighter-pre" data-syntaxhighlighter-params="brush: js; gutter: false">let a = 1 &lt; 2;</pre></div></div>',
      ),
      ctx,
    );
    expect(html).toContain('<pre><code class="language-javascript">let a = 1 &lt; 2;</code></pre>');
  });

  it('wandelt Aufgabenlisten, Status und Aufklapper um', () => {
    const { html } = convertConfluencePageHtml(
      wrap(
        '<ul class="inline-task-list"><li class="checked">Fertig</li><li>Offen</li></ul>' +
          '<span class="status-macro aui-lozenge aui-lozenge-error">KAPUTT</span>' +
          '<div class="expand-container"><div class="expand-control"><span class="expand-control-text">Mehr</span></div><div class="expand-content"><p>Inhalt</p></div></div>',
      ),
      ctx,
    );
    expect(html).toContain('data-type="taskList"');
    expect(html).toContain('data-checked="true"');
    expect(html).toContain('data-checked="false"');
    expect(html).toContain('<span data-type="status" data-color="red">KAPUTT</span>');
    expect(html).toContain('<details><summary>Mehr</summary>');
  });

  it('biegt Wiki-Links auf exportierte Seiten um', () => {
    const { html } = convertConfluencePageHtml(
      wrap(
        '<a href="https://x.atlassian.net/wiki/spaces/TEAM/pages/2/Andere+Seite">A</a>' +
          '<a href="/display/TEAM/Andere+Seite">B</a>' +
          '<a href="Andere-Seite_2.html#anker">C</a>',
      ),
      ctx,
    );
    expect(html.match(/href="Andere-Seite_2.html"/g)).toHaveLength(3);
  });

  it('hängt nicht verwendete Anhänge unten an', () => {
    const page = {
      filePath: 'TEAM/Seite_1.html',
      confluenceId: '1',
      title: 'Seite',
      parentFilePath: null,
      order: 0,
      attachments: [
        { href: 'TEAM/attachments/1/10.png', fileName: 'bild.png', mimeType: 'image/png' },
        { href: 'TEAM/attachments/1/11.pdf', fileName: 'plan.pdf', mimeType: 'application/pdf' },
      ],
    };
    const converted = convertConfluencePageHtml(
      wrap('<img src="attachments/1/10.png">'),
      ctx,
    );
    const html = appendUnreferencedAttachments(converted.html, page, converted.referencedPaths);
    expect(html).toContain('Anhänge');
    expect(html).toContain('attachments/1/11.pdf');
    expect(html.match(/10\.png/g)).toHaveLength(1);
  });
});
