// REV-077: every stylesheet closes each block it opens. A dropped "}" (a conflict resolution on #158) nested the next
// @media block inside a phone-only block, so later desktop rules applied on the phone only.
const test=require('node:test'),assert=require('assert'),fs=require('fs'),path=require('path');
const dir=path.resolve(__dirname,'..');
for(const f of fs.readdirSync(dir).filter(f=>/^(pipeline-ui-.*|tokens)\.css$/.test(f))){
  test('braces balance in '+f,()=>{const t=fs.readFileSync(path.join(dir,f),'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g,'""');
    let depth=0,line=1,min=0;for(const ch of t){if(ch==='\n')line++;if(ch==='{')depth++;if(ch==='}'){depth--;if(depth<0)assert.fail(f+': extra } near line '+line)}}
    assert.equal(depth,0,f+': '+depth+' unclosed block(s)');});
}
