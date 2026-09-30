"""Build a scrubbed fixture from a real master export. Usage: python3 tests/make_fixture.py <export.txt> > tests/fixtures/master.sample.txt
Scrubs company names, IDs, URLs, Gmail ids, people names in free text are NOT guaranteed removed: review before committing."""
import sys, re, random, hashlib
src = open(sys.argv[1], encoding='utf-8').read().replace('﻿','').split('\n')
random.seed(7)
rows_by_section = {}; section=None; header=[]; body_started=False
for ln in src:
    if not body_started:
        header.append(ln)
        if re.match(r'^={8,}\s*$', ln): body_started=True
        continue
    m = re.match(r'^=== (.+?) \((\d+)\) ===', ln)
    if m: section=m.group(1); rows_by_section.setdefault(section, []); continue
    if re.match(r'^\d+ \| ', ln): rows_by_section[section].append(ln)
# pick rows: ensure cases: 11-cell row, section!=bucket, PRE-EXISTING date, VERIFY_LATER, FLOOR_STATUS, DECLINED with reason
picked=[]
def want(pred, n=1):
    got=0
    for sec, rows in rows_by_section.items():
        for r in rows:
            if r in picked: continue
            if pred(sec, r):
                picked.append(r); got+=1
                if got>=n: return
want(lambda s,r: len(r.split(' | '))==11, 2)
want(lambda s,r: r.split(' | ')[4]!=s, 3)
want(lambda s,r: 'PRE-EXISTING' in r, 2)
want(lambda s,r: 'VERIFY_LATER=' in r, 1)
want(lambda s,r: 'FLOOR_STATUS=' in r, 1)
want(lambda s,r: r.split(' | ')[4]=='READY_TO_PURSUE', 3)
want(lambda s,r: r.split(' | ')[4]=='APPLIED', 2)
want(lambda s,r: r.split(' | ')[4]=='BLOCKED', 1)
want(lambda s,r: r.split(' | ')[4]=='DECLINED_BY_TIM' and 'PAY_BELOW_FLOOR' in r, 2)
want(lambda s,r: r.split(' | ')[4]=='CLOSED_DEAD', 1)
want(lambda s,r: r.split(' | ')[4]=='DUPLICATE', 1)
# scrub
companies={}
def fake_company(name):
    if name not in companies: companies[name]='Company-%02d'%(len(companies)+1)
    return companies[name]
def scrub(line):
    parts=line.split(' | ')
    parts[2]=fake_company(parts[2])
    parts[1]='V2X-'+hashlib.md5(parts[1].encode()).hexdigest()[:12].upper()
    parts[5]=re.sub(r'DUP_OF \S+', 'DUP_OF V2X-000000000000', parts[5])
    rest=' | '.join(parts)
    rest=re.sub(r'https?://\S+', 'https://example.invalid/job/'+hashlib.md5(rest.encode()).hexdigest()[:8], rest)
    rest=re.sub(r'Gmail [0-9a-f]{12,}', 'Gmail 0000000000000000', rest)
    rest=re.sub(r'GMAIL_[0-9a-f]{12,}', 'GMAIL_0000000000000000', rest)
    # blank out free-text evidence fields that name other employers or people
    rest=re.sub(r'(SALARY_ANCHORS|SALARY_REASON|SALARY_AUDIT|AUDIT_[A-Z0-9]+|APP_STATUS_EVIDENCE|APP_STATUS_CHECK|DECLINE_REASON_TEXT|REOPEN_TRIGGER|RESOLUTION_NOTE)=[^;]*(?:; (?![A-Z][A-Z0-9_]*=)[^;]*)*', lambda m: m.group(1)+'=<scrubbed>', rest)
    rest=re.sub(r'(TAGS_PLACEHOLDER)', '', rest)
    rest=re.sub(r'\b(LI|GH|R|WD|JR)[- ]?\d{5,}\b', lambda m: m.group(1)+'-'+str(random.randint(1000000,9999999)), rest)
    for real,fake in companies.items(): rest=rest.replace(real,fake)
    if len(parts)==11:  # keep the pipe-in-payload case alive after scrubbing
        rest=rest.replace('SALARY_ANCHORS=<scrubbed>', 'SALARY_ANCHORS=n2 bands: Anchor A, City ST, $180k-$220k https://example.invalid/a | Anchor B, City ST, $170k-$210k https://example.invalid/b',1)
    return rest
out=[]
out.append('V2_CURRENT_POPULATION_FIXTURE (scrubbed sample for parser tests; company names, IDs and URLs replaced). CURRENT AUTHORITATIVE POPULATION FOR ALL SCOUT/GROK RUNS.')
out.append('BUCKET_AUTHORITY_2026-09-29: The canonical row BUCKET field is authoritative for current disposition. Physical paragraph placement under section headings may lag.')
# regroup picked rows by their ORIGINAL section (to preserve mismatch cases)
sec_of={}
for sec,rows in rows_by_section.items():
    for r in rows: sec_of[r]=sec
groups={}
for r in picked: groups.setdefault(sec_of[r], []).append(scrub(r))
# add one deliberately malformed row and one unknown-key row
groups.setdefault('MANUAL_RESEARCH', []).append('999 | V2X-MALFORMED | Company-99 | Broken Row Missing Cells')
groups['MANUAL_RESEARCH'].append('998 | V2X-UNKNOWNKEY | Company-98 | Director of Something | MANUAL_RESEARCH | RESOLVED/MANUAL_RESEARCH | - | GH-1234567 | Nowhere, TN | RESEARCH_OK; DATE_ADDED=2026-09-29; NOTIFICATION_SOURCE=LinkedIn; MYSTERY_KEY=some value; FLEX=SOFT')
counts={}
for sec,rows in groups.items():
    for r in rows:
        p=r.split(' | ')
        b=p[4] if len(p)>4 else '(blank)'
        counts[b]=counts.get(b,0)+1
total=sum(counts.values())
order=['READY_TO_PURSUE','DECLINED_BY_TIM','MANUAL_RESEARCH','BLOCKED','TIM_DECISION_REQUIRED','APPLIED','REJECTED_BY_EMPLOYER','DUPLICATE','CLOSED_DEAD']
out.append('COUNTS: TOTAL=%d '%total + ' '.join('%s=%d'%(k,counts.get(k,0)) for k in order) + ' UNACCOUNTED=0')
out.append('COLUMNS: INV | PRIMARY_ID | COMPANY | TITLE | BUCKET | DISPOSITION/RULE_OUTCOME | TAGS | REQ | LOCATION | SCOUT_ACTION')
out.append('='*64)
for sec in order:
    if sec in groups:
        # declared heading count deliberately equals number physically placed (may differ from BUCKET tally)
        out.append(''); out.append('=== %s (%d) ==='%(sec, len(groups[sec])))
        out.extend(groups[sec])
print('\n'.join(out))
