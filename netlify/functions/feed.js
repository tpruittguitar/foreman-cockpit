// Retired cockpit feed: no public target-list export.
exports.handler=async()=>({statusCode:410,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({ok:false,error:'The old cockpit feed is retired. Use Pipeline Explorer.'})});
