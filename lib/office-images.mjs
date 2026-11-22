// Private coding attachment contract. No mailbox URLs, file paths or remote fetches.
export const IMAGE_LIMIT = 4 * 1024 * 1024, TOTAL_LIMIT = 8 * 1024 * 1024, IMAGE_COUNT = 4;
export const REQUEST_LIMIT = Math.ceil(TOTAL_LIMIT * 4 / 3) + 24000;
const fail = () => { throw Error('Use up to 4 PNG or JPEG images, 4 MB each and 8 MB total'); };
export async function codingImages(files = []) {
  if (!Array.isArray(files) || files.length > IMAGE_COUNT) fail();
  let total = 0;
  return Promise.all(files.map(async f => {
    if (!f || Object.keys(f).some(k => !['name','type','data'].includes(k)) || typeof f.name !== 'string' || !f.name || f.name.length > 120 || /[\x00-\x1f\x7f/\\]/.test(f.name) || !['image/png','image/jpeg'].includes(f.type) || typeof f.data !== 'string') fail();
    const prefix='data:'+f.type+';base64,';
    if (!f.data.startsWith(prefix)) fail();
    const encoded=f.data.slice(prefix.length);
    if (!encoded || encoded.length > Math.ceil(IMAGE_LIMIT/3)*4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) fail();
    const raw=atob(encoded),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
    if (btoa(raw)!==encoded || bytes.length>IMAGE_LIMIT || (total+=bytes.length)>TOTAL_LIMIT) fail();
    const png=bytes.length>=24 && [137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n) && String.fromCharCode(...bytes.slice(12,16))==='IHDR';
    if(png) { const view=new DataView(bytes.buffer);const w=view.getUint32(16),h=view.getUint32(20);if(!w||!h||w*h>16000000)fail(); }
    const jpeg=bytes.length>=4 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255 && bytes.at(-2)===255 && bytes.at(-1)===217;
    if (!(f.type==='image/png'?png:jpeg)) fail();
    const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
    return {ref:{id:sha256,name:f.name,type:f.type,size:bytes.length,sha256},bytes};
  }));
}
export const attachmentBinding = job => Object.fromEntries(['tenant','owner','provider','conversationId','requestId','sessionId','repository','base','branch'].map(k=>[k,job[k]]));
export async function codexImageInput(job, store) {
  const input=[{type:'text',text:job.text}];
  for(const ref of job.attachments||[]) {
    if(!store)throw Error('Private images unavailable');
    const bytes=await store.get(attachmentBinding(job),ref);
    let raw='';for(const byte of bytes)raw+=String.fromCharCode(byte);
    const data='data:'+ref.type+';base64,'+btoa(raw);
    const [checked]=await codingImages([{name:ref.name,type:ref.type,data}]);
    if(JSON.stringify(checked.ref)!==JSON.stringify(ref))throw Error('Image integrity mismatch');
    input.push({type:'image',url:data});
  }
  return input;
}
