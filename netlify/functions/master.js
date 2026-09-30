// Read-only fetch of the fixed canonical master (Tim's 2026-09-29 ruling, cutover REV2).
// Requires the Doc to be shared as "Anyone with the link: Viewer". Export reads do not change modifiedTime.
const FIXED_ID = "19y5xtspYk3ze_E2uRMcUsK3CNh3tbtCILz-us8YtpDI";
const json = (body) => ({ statusCode: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, body: JSON.stringify(body) });
exports.handler = async () => {
  const id = process.env.MASTER_FILE_ID || FIXED_ID;
  const url = "https://docs.google.com/document/d/" + id + "/export?format=txt";
  try {
    const res = await fetch(url, { redirect: "follow" });
    const text = await res.text();
    const looksHtml = /<html|<!doctype html/i.test(text.slice(0, 600));
    if (!res.ok || looksHtml) {
      return json({ ok: false, id, status: res.status, fetchedAt: new Date().toISOString(),
        hint: "The master Doc is not readable by link yet. Open it in Google Docs, Share, General access, choose 'Anyone with the link' as Viewer, then Refresh here." });
    }
    return json({ ok: true, id, status: res.status, fetchedAt: new Date().toISOString(), bytes: text.length, text });
  } catch (e) {
    return json({ ok: false, id, status: 0, fetchedAt: new Date().toISOString(), hint: "fetch failed: " + (e && e.message) });
  }
};
