// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
export function getHostnameUrl(hostname: string): string {
  const { protocol, port } = window.location;
  return `${protocol}//${hostname}${port ? `:${port}` : ""}`;
}

export function exchangeTokenRedirectUrl(
  hostname: string,
  exchangeToken: string,
): string {
  return `${getHostnameUrl(hostname)}/api/auth/exchange?token=${encodeURIComponent(exchangeToken)}`;
}
