import path from 'node:path';
import os from 'node:os';

// On the verified Windows runtime, a profile-temp checkout was reported as cwd
// by the protocol while PowerShell actually started at C:\. Reject that location
// rather than changing ACLs or weakening the sandbox to compensate.
export function assertWorkspaceLocation(workspace, { platform = process.platform, userProfile = process.env.USERPROFILE, tempRoot = os.tmpdir() } = {}) {
  if (platform !== 'win32') return;
  const resolved = path.win32.resolve(workspace).toLowerCase();
  for (const root of [userProfile, tempRoot].filter(Boolean)) {
    const base = path.win32.resolve(root).toLowerCase();
    if (resolved === base || resolved.startsWith(base.endsWith('\\') ? base : base + '\\')) {
      throw Error('Use a dedicated Windows worktree outside the user profile and temporary directory, for example C:\\projects. The native shell must start inside that worktree.');
    }
  }
}
