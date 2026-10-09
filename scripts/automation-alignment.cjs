#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const Alignment=require('../pipeline-alignment');
const [mode,taskKey,inputFile]=process.argv.slice(2);
try{
 if(mode==='catalogue')process.stdout.write(JSON.stringify({version:Alignment.VERSION,tasks:Alignment.TASKS,nativeControl:'UNSUPPORTED'},null,2)+'\n');
 else if(mode==='prompt'&&taskKey&&inputFile){const scope=JSON.parse(fs.readFileSync(inputFile,'utf8'));process.stdout.write(Alignment.prompt(Alignment.task(taskKey),scope)+'\n');}
 else if(mode==='check'&&inputFile){const input=JSON.parse(fs.readFileSync(inputFile,'utf8')),result=Alignment.preflight(input);process.stdout.write(JSON.stringify(result,null,2)+'\n');if(!result.allowed)process.exitCode=2;}
 else throw Error('Usage: catalogue | prompt TASK_KEY APPROVED_SCOPE.json | check TASK_KEY PREFLIGHT.json. Checks are supplied observations, not live native attestation.');
}catch(e){process.stderr.write(e.message+'\n');process.exitCode=1;}
