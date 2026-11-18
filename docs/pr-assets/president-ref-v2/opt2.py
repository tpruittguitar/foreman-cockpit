import json, subprocess, sys, os, numpy as np, pscore
VIEWS=json.load(open('views2.json'))
def evaluate(cands, tag, views=None):
    views=views or VIEWS
    jobs=[{'out':f'opt2/{tag}_{k}','p':p,'views':views} for k,p in enumerate(cands)]
    json.dump(jobs,open('jopt2.json','w')); subprocess.run(['node','rb2.cjs','jopt2.json'],check=True,env={**os.environ,'PAR':'7'})
    pr=[(f'opt2/{tag}_{k}/v{i+1}.png',[i+1]) for k in range(len(cands)) for i in range(6)]
    r=pscore.score_paths(pr)
    return [[r[k*6+i][0][0] for i in range(6)] for k in range(len(cands))]
if __name__=='__main__':
    cur=json.load(open('best2.json'))
    steps=json.load(open('steps2.json'))
    base=evaluate([cur],'b')[0]; bm=np.mean(base); print('start',round(bm,4),np.round(base,3),flush=True)
    for r in range(int(sys.argv[1])):
        cands,meta=[],[]
        for k,st in steps.items():
            for sg in (-1,1):
                c=dict(cur); c[k]=round(c[k]+sg*st,4); cands.append(c); meta.append(k)
        res=evaluate(cands,f'r{r}'); m=[np.mean(x) for x in res]
        win={}
        for o in np.argsort(m)[::-1]:
            if m[o]>bm+1e-4 and meta[o] not in win: win[meta[o]]=cands[o][meta[o]]
        if win:
            t={**cur,**win}; rt=evaluate([t],'w')[0]
            best_o=int(np.argmax(m))
            if np.mean(rt)>=m[best_o]: cur,base=t,rt
            else: cur,base=cands[best_o],res[best_o]
            bm=np.mean(base)
        else:
            steps={k:v/2 for k,v in steps.items()}
        json.dump(cur,open('best2.json','w'))
        print(f'round {r} {bm:.4f} min {min(base):.3f}',np.round(base,3),win,flush=True)
