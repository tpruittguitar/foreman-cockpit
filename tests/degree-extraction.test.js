const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Q=require('../apps-script/PipelineQualification.gs'),A=require('../apps-script/PipelineAts.gs'),P=require('../pipeline-policy');
const fixtures=require('./fixtures/degree-extraction.json');
const policy=P.normalizeFlexPolicy({FLEX_POLICY_VERSION:'RULES_V4_20261007',EQUIVALENCY_CLASS:'HIGH_FLEX',HARD_DEGREE_CLASS:'NO_FLEX'});
for(const c of fixtures)test('degree contract: '+c.name,()=>{
 const expected=c.text===null?null:{text:c.text,req:c.req};
 assert.deepEqual(Q.parse(c.input),expected);assert.equal(A.degreeFromText(c.input),c.text&&c.text!=='NOT_STATED'?c.text:'');
 if(c.flex)assert.equal(P.flex({DEGREE_TEXT:A.degreeFromText(c.input)},policy).class,c.flex);
});
const row={PRIMARY_ID:'x',TITLE:'Director',BUCKET:'SCOUT_INTAKE',p:{}},target={provider:'WORKDAY',url:'https://acme.example/job/1'};
test('ATS interpretation through Writer fields retains a late alternative, not just the first 400 characters',()=>{
 const input="Bachelor's degree in "+'manufacturing and engineering systems, '.repeat(15)+'required. Equivalent experience is accepted in lieu of a degree.';
 assert.ok(input.length>500);
 const result=A.interpret(target,200,JSON.stringify({jobPostingInfo:{title:'Director',jobDescription:input}}),row),fields=A.fieldsFor(row,target,result);
 assert.equal(result.degree,input);assert.equal(fields.ATS_DEGREE_TEXT,input);assert.equal(fields.DEGREE_TEXT,input);assert.equal(P.flex(fields,policy).class,'HIGH_FLEX');
 const existing=A.fieldsFor({...row,p:{DEGREE_TEXT:"Bachelor's degree required."}},target,result);
 assert.equal(existing.DEGREE_TEXT,undefined,'no silent historical repair');assert.equal(existing.ATS_DEGREE_TEXT,input);
 const oversized=input.repeat(3);assert.equal(A.degreeFromText(oversized),'');assert.equal(A.fieldsFor(row,target,{result:'LIVE',degree:oversized}).DEGREE_TEXT,undefined);
});
test('Apps Script globals resolve the shared parser lazily regardless of file evaluation order',()=>{
 const ctx=vm.createContext({});
 for(const file of ['PipelineAts.gs','PipelineQualification.gs'])vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/'+file,'utf8'),ctx);
 assert.equal(ctx.PipelineAts.degreeFromText(fixtures[0].input),fixtures[0].text);
});
