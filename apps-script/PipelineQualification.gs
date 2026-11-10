/* Shared qualification parser: keep byte-identical to foreman-cockpit/apps-script/PipelineQualification.gs. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.PipelineQualification = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';
const VERSION='20261110-degree-abbreviations-v2',MAX_EVIDENCE_LENGTH=1200;
// Qualification facts retain the governing section and adjacent alternatives.
// Joined department names such as MS&T are not standalone academic credentials.
// Generic uses of "degree", "Master" and office-software abbreviations are not credentials.
const credential=/\b(?:bachelor'?s?|master(?:'?s|(?=\s+(?:degree|of|in)\b))|b\.?\s*[sa]\.?|m\.?\s*s\.?(?!\s*(?:office|excel|word|project|teams|visio|access|powerpoint)\b|\.?\s*&\s*[a-z])|mba|ph\.?\s?d\.?|associate'?s?\s+degree|(?:advanced|graduate|undergraduate|college|university|four[- ]year|4[- ]year)\s+degree|diploma|ged)\b|\bdegree\s+in\s+[a-z]/i;
const negatedEquivalent=/\b(?:no|not|without)\s+(?:\w+\s+){0,3}equivalent\s+(?:work\s+)?experience\b|equivalent\s+(?:work\s+)?experience\s+(?:(?:(?:is|will|may|can)\s+)?not\s+(?:be\s+)?|cannot\s+(?:be\s+)?)(?:accepted|allowed|considered)/i;
const alternate=/\bor\s+(?:(?:an?|at least|minimum of)\s+)?(?:\d+\+?\s*years?\b|(?:extensive|relevant|additional|professional)\s+experience\b)/i;
const equivalent=/\bequivalent\s+(?:(?!(?:field|discipline|major|degree|area|program|programme|qualification)\b)[\w'-]+\s+){0,5}?(?:experience|education\s+(?:and|&|\/|or)\s+experience)\b|\bin lieu of (?:a |the )?(?:bachelor'?s? )?degree\b/i;
const substitution=/\bexperience\s+(?:(?:may|can|will)\s+(?:be\s+)?|is\s+)(?:substituted?\s+for|accepted\s+in\s+lieu\s+of|considered\s+in\s+lieu\s+of)\s+(?:(?:a|an|the)\s+)?(?:bachelor'?s?\s+|master'?s?\s+|college\s+|university\s+)?degree\b|\bexperience may substitute(?=\s*(?:[.)]|$))/i;
function hasAlternative(line){return equivalent.test(line)||substitution.test(line)||alternate.test(line);}
function alternative(line){return /^(?:or\b|in lieu of\b|(?:an? )?equivalent\b|(?:relevant |work |related |professional |additional )?experience\b)/i.test(line)&&hasAlternative(line);}
function plain(input){return String(input||'').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<\/?(?:h[1-6]|p|div|li|ul|ol|br)\b[^>]*>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&#39;|&rsquo;|&#x27;|[’‘]/gi,"'").replace(/&amp;/gi,'&').replace(/[ \t\r]+/g,' ');}
function parse(input){
 const text=plain(input);if(!text.trim())return null;
 const lines=text.split(/\n+|\s*[•·▪●]\s*|(?<!\b[A-Za-z]\.[A-Za-z])(?<!\b[A-Z])(?<=[.!?])\s+(?=[A-Z0-9(])/).map(x=>x.replace(/^[\s•\-–*]+/,'').trim()).filter(Boolean);
 let section=null,sectionHeading='';const facts=[];let optionalWithoutPreference=false,unresolved=false;
 for(let i=0;i<lines.length;i++){
  const line=lines[i],heading=line.replace(/^[#*\s]+|[*\s]+$/g,'');
  if(/^(?:preferred|desired|nice to have)(?:\s+(?:qualifications?|requirements?|education|skills|experience))?\s*:?(?:\s*$)/i.test(heading)){section='PREFERRED';sectionHeading=heading;continue;}
  if(/^(?:required|minimum|basic|essential)(?:\s+(?:qualifications?|requirements?|education|skills|experience))?\s*:?(?:\s*$)/i.test(heading)){section='REQUIRED';sectionHeading=heading;continue;}
  if(/^(?:qualifications?|education(?: and experience)?|requirements?|what you bring)\s*:?$/i.test(heading)){section=null;sectionHeading='';continue;}
  if(/^(?:responsibilities|benefits|about us|what we offer|equal opportunity)\s*:?$/i.test(heading)){section='NON_QUALIFICATION';continue;}
  if(section==='NON_QUALIFICATION')continue;
  if(!credential.test(line)||/\b(?:without|regardless of|no college|no university)\s+(?:a |an? )?(?:college |university )?degree\b/i.test(line))continue;
  let quote=line,following=lines[i+1]||'';
  // Join only an explicit adjacent alternative, never an unrelated experience bullet
  // or a new section. A wrapped 'or' belongs to the next clause.
  if(/^or\s*$/i.test(following)&&lines[i+2])following+=' '+lines[i+2];
  if(alternative(following))quote+=' '+following;
  // Separate credential clauses, not unrelated modifiers in a single clause.
  // A mandatory master's must survive a preceding preferred bachelor's.
  const scoped=quote.replace(/\([^)]*(?:advanced|graduate|master|mba|ph\.?d)[^)]*\b(?:preferred|desired|a plus)[^)]*\)/gi,'').replace(/\(\s*(?:strongly )?preferred\s*\)(?=\s+or\s+(?:a |an? )?(?:closely )?related)/gi,'');
  const segments=[];for(const part of scoped.split(/;\s*/)){if(segments.length&&alternative(part))segments[segments.length-1]+='; '+part;else segments.push(part);}
  const clauses=segments.flatMap(scoped=>(/[,;]\s*or\b/i.test(scoped)&&/\b(?:preferred|desired)|a plus|nice to have\b/i.test(scoped)&&!/\brequired|must (?:have|hold)|mandatory\b/i.test(scoped)?[scoped]:scoped.split(/,\s*(?=with\s+technical\s+education)|,\s*(?=(?:an?\s+)?(?:bachelor|master|mba|m\.\s?s|ms|ph\.?\s?d|advanced|graduate))|\s+(?:and|but)\s+(?=(?:an?\s+)?(?:bachelor|master|mba|advanced|graduate))/i))).filter(c=>credential.test(c));
  const requirements=[];
  for(const base of clauses){
   const negated=/\b(?:not (?:strictly )?(?:required|necessary|mandatory)|optional|(?:do not|don't|does not|doesn't) require|no requirement for)\b/i.test(base)||/^\s*no\s+(?:bachelor'?s?\s+)?(?:college\s+)?degree\b[^.]{0,40}\brequired\b/i.test(base);
   const required=!negated&&/\brequired|must (?:have|hold)|mandatory\b/i.test(base),preferred=/\bpreferred|a plus|nice to have|desired\b/i.test(base)||/^(?:preferred|desired) qualifications?\s*:/i.test(line);
   if(required&&preferred&&base.search(/\b(?:preferred|desired)|a plus|nice to have\b/i)<base.search(/\brequired|must (?:have|hold)|mandatory\b/i))return null;
   if(negated&&!preferred&&section!=='PREFERRED'&&!equivalent.test(base)&&!substitution.test(base)){optionalWithoutPreference=true;continue;}
   requirements.push((hasAlternative(base)&&!negatedEquivalent.test(base))?'PREFERRED':required?'REQUIRED':preferred||section==='PREFERRED'?'PREFERRED':'REQUIRED');
  }
  if(!requirements.length)continue;
  const req=requirements.includes('REQUIRED')?'REQUIRED':'PREFERRED';
  // A prefix clip can erase the alternative that determined req. Omit an
  // oversized/ambiguous block rather than submit an internally contradictory fact.
  const evidence=section==='PREFERRED'&&!/\bpreferred|desired|a plus|nice to have\b/i.test(quote)?sectionHeading+' '+quote:quote;
  if(evidence.length>MAX_EVIDENCE_LENGTH||(req==='REQUIRED'&&hasAlternative(quote)&&!negatedEquivalent.test(quote)&&(requirements.includes('PREFERRED')||!hasAlternative(scoped)))){unresolved=true;continue;}
  facts.push({text:evidence,req});
 }
 if(unresolved)return null;
 if(facts.length)return facts.find(f=>f.req==='REQUIRED')||facts[0];
 return optionalWithoutPreference||/\bdegree\b/i.test(text)?null:{text:'NOT_STATED',req:'NOT_STATED'};
}
return {parse,plain,VERSION,MAX_EVIDENCE_LENGTH};
});
