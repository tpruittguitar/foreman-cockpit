#!/usr/bin/env python3
"""Minimal Apps Script API client using the clasp login (~/.clasprc.json). Used by deploy.sh.

  gas_api.py get-content <scriptId> <outdir>        write every project file to outdir (<name>.js / appsscript.json)
  gas_api.py set-content <scriptId> <dir>           replace the project contents with exactly the .js/.json files in dir
  gas_api.py version     <scriptId> <description>   create a version, print its number
  gas_api.py deploy      <scriptId> <deploymentId> <version> <description>   point an existing deployment at a version
"""
import json, os, sys, urllib.request, urllib.parse

API = 'https://script.googleapis.com/v1/projects/'


def token():
    c = json.load(open(os.path.expanduser('~/.clasprc.json')))['tokens']['default']
    body = urllib.parse.urlencode({'client_id': c['client_id'], 'client_secret': c['client_secret'],
                                   'refresh_token': c['refresh_token'], 'grant_type': 'refresh_token'}).encode()
    return json.load(urllib.request.urlopen('https://oauth2.googleapis.com/token', body))['access_token']


def call(method, path, data=None):
    req = urllib.request.Request(API + path, method=method, data=None if data is None else json.dumps(data).encode(),
                                 headers={'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json'})
    try:
        return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        sys.exit('%s %s -> %s %s' % (method, path, e.code, e.read().decode()[:800]))


def main(a):
    if a[0] == 'get-content':
        os.makedirs(a[2], exist_ok=True)
        for f in call('GET', a[1] + '/content')['files']:
            ext = '.json' if f['type'] == 'JSON' else '.html' if f['type'] == 'HTML' else '.js'
            open(os.path.join(a[2], f['name'] + ext), 'w', encoding='utf-8').write(f['source'])
    elif a[0] == 'set-content':
        files = []
        for n in sorted(os.listdir(a[2])):
            p = os.path.join(a[2], n)
            if n.startswith('.') or not os.path.isfile(p):
                continue
            if n == 'appsscript.json':
                files.append({'name': 'appsscript', 'type': 'JSON', 'source': open(p, encoding='utf-8').read()})
            elif n.endswith('.js'):
                files.append({'name': n[:-3], 'type': 'SERVER_JS', 'source': open(p, encoding='utf-8').read()})
        if not any(f['name'] == 'appsscript' for f in files):
            sys.exit('refusing to set content without appsscript.json')
        r = call('PUT', a[1] + '/content', {'scriptId': a[1], 'files': files})
        print('project now has: ' + ', '.join(f['name'] for f in r['files']))
    elif a[0] == 'version':
        print(call('POST', a[1] + '/versions', {'description': a[2]})['versionNumber'])
    elif a[0] == 'deploy':
        r = call('PUT', a[1] + '/deployments/' + a[2], {'deploymentConfig': {'scriptId': a[1], 'versionNumber': int(a[3]), 'manifestFileName': 'appsscript', 'description': a[4]}})
        print('deployment %s -> version %s' % (r['deploymentId'], r['deploymentConfig']['versionNumber']))
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main(sys.argv[1:]) if len(sys.argv) > 2 else sys.exit(__doc__)
