// Small server-side HTML helpers for generating the static archive pages.

export function escapeHtml(s: string | undefined | null): string {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Serialize data for an inline <script>. JSON.stringify alone lets a message
 * containing "</script>" close the tag and inject markup, so escape the
 * characters that matter to the HTML parser (and the JS line terminators).
 */
export function inlineJson(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export interface PageOptions {
  title: string
  /** Relative path to the assets/ folder (e.g. "assets", "../../assets"). */
  assetsPath: string
  /** Extra <head> content. */
  head?: string
  body: string
  /** JS data object embedded as window[varName] before app.js loads. */
  embed?: { varName: string; data: unknown }
}

export function page(opts: PageOptions): string {
  const embedScript = opts.embed
    ? `<script>window.${opts.embed.varName} = ${inlineJson(opts.embed.data)};</script>`
    : ''
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(opts.title)}</title>
<link rel="stylesheet" href="${opts.assetsPath}/styles.css" />
${opts.head ?? ''}
</head>
<body>
${opts.body}
<div class="lightbox"><img alt="" /></div>
${embedScript}
<script src="${opts.assetsPath}/app.js"></script>
</body>
</html>`
}

export function topBar(titleHtml: string, crumbsHtml = '', withSearch = true): string {
  return `<div class="topbar">
  <h1>${titleHtml}</h1>
  ${crumbsHtml ? `<span class="crumbs">${crumbsHtml}</span>` : ''}
  <div class="spacer"></div>
  ${withSearch ? `<input id="search" class="search" placeholder="Search…" />` : ''}
  <div class="themes"></div>
</div>`
}

export function fmtDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10)
  } catch {
    return iso
  }
}
