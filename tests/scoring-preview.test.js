const test=require('node:test'),assert=require('node:assert/strict');
const Prev=require('../pipeline-scoring-preview'),Scoring=require('../pipeline-scoring'),Parser=require('../pipeline-parser'),fs=require('fs'),path=require('path');
const fixture=fs.readFileSync(path.join(__dirname,'fixtures','master.sample.txt'),'utf8');
const rows=Parser.parse(fixture).rows;
const base=()=>Scoring.defaults();
const withWeights=w=>{const c=base();c.weights=Object.assign({},c.weights,w);return Scoring.normalize(c)};
const fake=(table)=>(r,cfg)=>({overall:table[cfg.tag][r.id]==null?null:table[cfg.tag][r.id],band:table[cfg.tag][r.id]>=60?'STRONG':'WEAK'});
const R=(id,bucket)=>({id,BUCKET:bucket||'SCOUT_INTAKE',COMPANY:'Co '+id,TITLE:'Title '+id,payload:{}});

test('identical models change nothing: no rating, rank, or band moves',()=>{
  const c=base(),out=Prev.compare(rows,Scoring.scoreRow,c,c);
  assert.equal(out.identical,true);assert.equal(out.ratingUp+out.ratingDown,0);assert.equal(out.rankUp+out.rankDown,0);assert.equal(out.bandChanges,0);assert.equal(out.avgDelta,0);
  assert.equal(out.movers.length,0);assert.deepEqual(out.top.entered,[]);assert.deepEqual(out.top.left,[]);assert(out.population>0);
});

test('a weight change moves ratings and ranks on the real fixture, and the counts are internally consistent',()=>{
  const before=base(),after=withWeights({experience:5,flex:5,compensation:70,geo:15,ats:0,title:5,culture:0,ownership:0});
  const out=Prev.compare(rows,Scoring.scoreRow,before,after);
  assert.equal(out.identical,false);
  const both=out.ratingUp+out.ratingDown+out.ratingSame;
  assert.equal(both,out.rankUp+out.rankDown+out.rankSame,'every row rated under both models is classified once for rating and once for rank');
  assert(out.ratingUp+out.ratingDown>0);assert.equal(out.top.before.length,Math.min(10,out.ratedBefore));
  assert(out.movers.every(m=>m.rankDelta!==0));
  for(let i=1;i<out.movers.length;i++)assert(Math.abs(out.movers[i-1].rankDelta)>=Math.abs(out.movers[i].rankDelta),'movers are ordered by size of rank change');
});

test('rank uses the rating (high first), stable by id; unrated rows have no rank and are counted as newly rated or unrated',()=>{
  const rs=[R('A'),R('B'),R('C'),R('D')];
  const fn=fake({b:{A:90,B:80,C:70,D:null},a:{A:60,B:80,C:95,D:50}});
  const out=Prev.compare(rs,fn,{tag:'b'},{tag:'a'},{topN:2});
  assert.deepEqual(out.top.before.map(x=>x.id),['A','B']);assert.deepEqual(out.top.after.map(x=>x.id),['C','B']);
  assert.deepEqual(out.top.entered.map(x=>x.id),['C']);assert.deepEqual(out.top.left.map(x=>x.id),['A']);
  assert.equal(out.newlyRated,1);assert.equal(out.rankUp,1);assert.equal(out.rankDown,1);assert.equal(out.ratingUp,1);assert.equal(out.ratingDown,1);assert.equal(out.ratingSame,1);
  assert.equal(out.maxUp.id,'C');assert.equal(out.maxUp.delta,25);assert.equal(out.maxDown.id,'A');assert.equal(out.maxDown.delta,-30);assert.equal(out.avgDelta,-1.7);
  assert.deepEqual(out.movers.map(m=>[m.id,m.rankDelta]),[['A',-2],['C',2]],'equal-size moves are ordered by id');
  assert.equal(out.bandChanges,0,'no row crosses the 60 band threshold');
});

test('only active-work buckets are ranked by default; a scorer that throws is counted, never fatal',()=>{
  const rs=[R('A','SCOUT_INTAKE'),R('B','APPLIED'),R('C','DECLINED_BY_TIM'),R('D','READY_TO_PURSUE')];
  const out=Prev.compare(rs,fake({b:{A:50,B:99,C:99,D:60},a:{A:55,B:1,C:1,D:60}}),{tag:'b'},{tag:'a'});
  assert.equal(out.population,2);assert.equal(out.ratingUp,1);
  const boom=(r,cfg)=>{if(r.id==='A')throw new Error('x');return {overall:10,band:'WEAK'}};
  const o2=Prev.compare([R('A'),R('B')],boom,{},{});assert.equal(o2.errors,1);assert.equal(o2.identical,false,'a scoring error blocks "no change"');
});

test('describeChanges names every difference in plain words and nothing else',()=>{
  const before=base(),after=JSON.parse(JSON.stringify(base()));
  assert.deepEqual(Prev.describeChanges(before,after),[]);
  after.weights.geo=Number(after.weights.geo)+5;after.weights.flex=Number(after.weights.flex)-5;after.salary.floor=190000;after.geo.power=3;after.resumeKeywords+=', lean';
  after.geo.controlPoints[0].score=90;after.geo.controlPoints.push({name:'Austin, TX',lat:30.27,lon:-97.74,score:60,hard:false});after.geo.controlPoints.splice(1,1);
  const d=Prev.describeChanges(before,after);
  assert(d.some(x=>/^Weight geo: .* → /.test(x)));assert(d.some(x=>/^Weight flex: /.test(x)));assert(d.some(x=>/^Salary floor: \$\d/.test(x)&&/\$190,000$/.test(x)));
  assert(d.some(x=>/^Geo interpolation power: 2 → 3$/.test(x)));assert(d.some(x=>x==='Resume / ATS keywords changed'));
  assert(d.some(x=>/^Location point Cleveland, TN: score 100 → 90$/.test(x)));assert(d.some(x=>/^Location point added: Austin, TX \(score 60\)$/.test(x)));assert(d.some(x=>/^Location point removed: New York, NY$/.test(x)));
  assert.equal(d.length,8);
});
