function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function buildTransparencyRss(db, baseUrl) {
  const claims = db.collection('claims');
  const recent = await claims
    .find({ blockchain_confirmed: true })
    .sort({ blockchain_confirmed_at: -1, created_at: -1 })
    .limit(50)
    .toArray();

  const items = recent.map((claim) => {
    const title = `Bitcoin confirmed: ${claim.id}`;
    const link = `${baseUrl}/proof/${claim.id}`;
    const pubDate = new Date(claim.blockchain_confirmed_at || claim.created_at).toUTCString();
    const desc = `Hash ${claim.hash?.slice(0, 16)}… anchored in block ${claim.blockchain_block || '—'}`;
    return `
    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${escapeXml(pubDate)}</pubDate>
      <description>${escapeXml(desc)}</description>
    </item>`;
  }).join('');

  const updated = recent[0]
    ? new Date(recent[0].blockchain_confirmed_at || recent[0].created_at).toUTCString()
    : new Date().toUTCString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>OTRUST Transparency Feed</title>
    <link>${escapeXml(baseUrl)}/transparency</link>
    <description>Recently Bitcoin-confirmed OTRUST timestamp receipts</description>
    <language>en</language>
    <lastBuildDate>${escapeXml(updated)}</lastBuildDate>
    ${items}
  </channel>
</rss>`;
}