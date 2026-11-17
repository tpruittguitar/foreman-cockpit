import json, subprocess, sys, shutil, os, numpy as np
from PIL import Image
import score as S
views = json.load(open('views.json'))
refs = [Image.open(S.D + f'ref{i}.png') for i in range(1, 7)]
def evaluate(cands, tag):
    jobs = [{'out': f'opt/{tag}_{k}', 'p': p, 'views': views} for k, p in enumerate(cands)]
    json.dump(jobs, open('jobs_opt.json', 'w')); subprocess.run(['node', 'rb.cjs', 'jobs_opt.json'], check=True, env={**os.environ, 'PAR': '6'})
    res = []
    for k in range(len(cands)):
        sc = []
        for i in range(6):
            s = S.score_view(refs[i], Image.open(f'opt/{tag}_{k}/v{i+1}.png'))[0]; sc.append(s)
        res.append(sc)
    return res
if __name__ == '__main__':
    p = json.load(open('best.json')) if os.path.exists('best.json') else {}
    steps = {'tx': .05, 'ty': .05, 'tz': .05, 'head': .03, 'headY': .02, 'armT': .08, 'armL': .08, 'armX': .05, 'armY': .03, 'legT': .06, 'legL': .05, 'legX': .08, 'shoe': .08, 'hx': .06, 'hy': .06, 'hz': .06, 'hairY': .01}
    dflt = {'tx': 1, 'ty': 1, 'tz': 1, 'head': .86, 'headY': .6, 'armT': 1, 'armL': 1, 'armX': 1, 'armY': 1, 'legT': 1, 'legL': 1, 'legX': 1, 'shoe': 1, 'hx': 1, 'hy': 1, 'hz': 1, 'hairY': 0}
    cur = {**dflt, **p}; base = np.mean(evaluate([cur], 'b')[0]); print('start', base, flush=True)
    rounds = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    for r in range(rounds):
        cands, meta = [], []
        for k, st in steps.items():
            for sgn in (-1, 1):
                c = dict(cur); c[k] = round(c[k] + sgn * st, 4); cands.append(c); meta.append((k, sgn))
        res = evaluate(cands, f'r{r}'); m = [np.mean(x) for x in res]
        order = np.argsort(m)[::-1]; improved = False; base0 = base
        for o in order:
            if m[o] > base + 1e-4:
                k, sgn = meta[o]; cur[k] = cands[o][k]; base = m[o]; improved = True
                # greedy: also try to keep taking improvements from other params (apply independent winners)
                break
        # apply all independent winners at once, verify
        winners = {}
        for o in order:
            k, sgn = meta[o]
            if m[o] > base0 + 1e-4 and k not in winners: winners[k] = cands[o][k]
            if len(winners) >= 6: break
        if winners:
            t = {**cur, **winners}; mt = np.mean(evaluate([t], 'w')[0])
            if mt > base: cur, base = t, mt
        for k in steps: pass
        json.dump(cur, open('best.json', 'w')); print(f'round {r} score {base:.4f}', {k: v for k, v in cur.items() if v != dflt[k]}, flush=True)
        if not improved and not winners:
            steps = {k: v / 2 for k, v in steps.items()}
