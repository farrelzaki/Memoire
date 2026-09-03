export type OpenGraphMetadata = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
};

/**
 * Pulls Open Graph / basic `<head>` metadata out of an HTML string. Only
 * ever called on the head fragment already cut to size by the caller
 * (§29A.1 rule 2), so it doesn't need to worry about huge documents.
 */
export function parseOpenGraph(html: string, pageUrl: string): OpenGraphMetadata {
  const head = html.slice(0, html.toLowerCase().indexOf('</head>') + 7 || html.length);

  const metaContent = (property: string): string | null => {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`,
      'i',
    );
    const match = head.match(re) ?? head.match(swapAttrOrder(property));
    return match?.[1]?.trim() || null;
  };

  const swapAttrOrder = (property: string): RegExp =>
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`,
      'i',
    );

  const titleTag = head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || null;

  const iconHref =
    head.match(/<link[^>]+rel=["'](?:shortcut icon|icon)["'][^>]+href=["']([^"']*)["']/i)?.[1] ??
    head.match(/<link[^>]+href=["']([^"']*)["'][^>]+rel=["'](?:shortcut icon|icon)["']/i)?.[1] ??
    null;

  const resolve = (href: string | null): string | null => {
    if (!href) return null;
    try {
      return new URL(href, pageUrl).toString();
    } catch {
      return null;
    }
  };

  return {
    title: metaContent('og:title') ?? titleTag,
    description: metaContent('og:description') ?? metaContent('description'),
    imageUrl: resolve(metaContent('og:image')),
    faviconUrl: resolve(iconHref) ?? resolve('/favicon.ico'),
  };
}
