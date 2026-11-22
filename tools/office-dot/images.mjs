// Private SQLite storage; never served as a static file or exposed to ordinary chat.
import { attachmentBinding } from '../../lib/office-images.mjs';
export function privateImages(store) {
  const key=(binding,ref)=>JSON.stringify([attachmentBinding(binding),ref.id]);
  return {
    async put(binding,ref,bytes) {
      const k=key(binding,ref),encoded=Buffer.from(bytes).toString('base64'),old=store.read('image',k);
      if(old && old!==encoded)throw Error('Immutable image mismatch');
      if(!old)store.set('image',k,encoded);
    },
    async get(binding,ref) {
      const encoded=store.read('image',key(binding,ref));
      if(typeof encoded!=='string')throw Error('Private image unavailable in this owner request');
      return new Uint8Array(Buffer.from(encoded,'base64'));
    }
  };
}
