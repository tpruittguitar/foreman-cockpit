import {createCodingService} from '../office-coding.mjs';
import {CodingMailbox,githubRequest} from './mailbox.mjs';
import {createHostedCoding} from './hosted.mjs';
// Explicit, disabled-by-default deployment adapter. No live bindings are provisioned.
export async function configuredHostedCoding(env) {
 if(env?.OFFICE_CODING_RELAY_ENABLED!=='reviewed-v1')return createCodingService();
 const config=JSON.parse(env.OFFICE_CODING_RELAY_CONFIG||'null');
 if(!config||config.origin!=='https://foreman-cockpit.pages.dev'||config.binding?.repository!=='tpruittguitar/foreman-cockpit'||config.binding?.base!=='main'||!/^office-coding\/[\w-]{16,80}$/.test(config.binding?.branch||''))throw Error('Fixed Office relay scope required');
 const signing=JSON.parse(env.OFFICE_CODING_JOB_SIGNING_JWK||'null'),worker=JSON.parse(env.OFFICE_CODING_WORKER_PUBLIC_JWK||'null');
 if(!signing?.d||worker?.d||(signing.x===worker?.x&&signing.y===worker?.y))throw Error('Separate private ingress and public worker keys required');
 const publicJob={...signing};delete publicJob.d;delete publicJob.key_ops;
 const algorithm={name:'ECDSA',namedCurve:'P-256'};
 const [jobSigningKey,jobVerificationKey,statusVerificationKey]=await Promise.all([crypto.subtle.importKey('jwk',signing,algorithm,false,['sign']),crypto.subtle.importKey('jwk',publicJob,algorithm,false,['verify']),crypto.subtle.importKey('jwk',worker,algorithm,false,['verify'])]);
 return createHostedCoding({enabled:true,config,access:config.access,mailbox:new CodingMailbox(githubRequest(env.OFFICE_MAILBOX_TOKEN)),jobSigningKey,jobVerificationKey,statusVerificationKey});
}
