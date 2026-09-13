import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync('src/app/teams/[id]/page.tsx', 'utf8');
const teamReader = fs.readFileSync('src/lib/db/teams-admin.ts', 'utf8');

// The route must read the requested team directly through the authorized server
// reader; an aggregate cache may omit a valid appointed secondary team.
assert.match(page, /useTeam\b/);
assert.match(page, /useTeam\(teamId\)/);
assert.match(page, /directTeam\s*\?\?\s*teams\.find\(\(candidate: Team\) => candidate\.id === teamId\)/);
assert.match(page, /isDirectTeamLoading/);
assert.match(page, /isDirectTeamError/);

// The server reader must preserve the independent appointed-leader relation.
assert.match(teamReader, /requester\.role === 'Leader'\s*\?\s*await getLeaderTeamIds\(requester\)/s);
assert.match(teamReader, /\.eq\('leader_id', requester\.id\)/);
assert.match(teamReader, /if \(!scopedTeamIds\.includes\(id\)\) return null/);

console.log('QI_KIV2_TEAM_READ_PATH_REGRESSION=PASS');
