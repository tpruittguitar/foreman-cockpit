// Server-side fetch of the public COCKPIT_FEED_v2 Google Doc.
exports.handler = async () => {
  const FEED_ID = "16d2Ugupvf-kG0izs_3enct7X5PZSs3NoBZdFCwnP4OA";
  const url = "https://docs.google.com/document/d/" + FEED_ID + "/export?format=txt";
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return { statusCode: 502, headers:{"Content-Type":"text/plain"}, body: "upstream " + res.status };
    const text = await res.text();
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      body: text
    };
  } catch (e) {
    return { statusCode: 502, headers:{"Content-Type":"text/plain"}, body: "fetch failed: " + (e && e.message) };
  }
};
