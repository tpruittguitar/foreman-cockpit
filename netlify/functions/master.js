// The public master-export bridge is retired. Read through the authenticated writer.
exports.handler=async()=>({statusCode:410,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({ok:false,error:'Public master access is disabled. Configure the authenticated writer in Pipeline Explorer.'})});
