const CONTEXTUAL_HTML_CSP =
  "default-src 'none'; base-uri 'none'; form-action 'none'; connect-src 'none'; frame-src 'none'; img-src data: blob:; media-src data: blob:; font-src data:; style-src 'unsafe-inline'"

export function isolatedMobileContextualHtml(content: string): string {
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="${CONTEXTUAL_HTML_CSP}"><base href="about:blank">${content}`
}

export function shouldLoadMobileContextualHtmlUrl(url: string): boolean {
  return url === 'about:blank'
}
