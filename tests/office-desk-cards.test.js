// Physical cards (Tim, Nov 17 9:58 / 10:02 PM ET): each open checksheet card a bot owns lies on its desk, a new card is carried
// from the board first, done cards leave, and the pile is neat or messy per bot. Run: node --test tests/office-desk-cards.test.js
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const L = require('../office/office-logic.js');
const office = fs.readFileSync(path.join(__dirname, '../office/office.js'), 'utf8');
const IDS = { Software: 'b0178cd7', Cursor: 'b0178cd7', 'HR - Bot Trainer': '372936ae', HR: '372936ae', 'QA bot': '338fc1b1' };
const idOf = n => IDS[n] || '';
const STATUS = { items: [
  { id: 'cs-1', title: 'Desk screens at any distance', owner: 'QA bot', status: 'in_progress', source: 'checksheet' },
  { id: 'cs-2', title: 'QA the couch nap', owner: 'QA bot', status: 'queued', source: 'checksheet' },
  { id: 'cs-3', title: 'Old fix', owner: 'QA bot', status: 'done', source: 'checksheet' },
  { id: 'cs-4', title: 'Train Gauge', owner: 'HR - Bot Trainer', status: 'in_progress', source: 'checksheet' },
  { id: 'cs-5', title: 'Cards to desks', owner: 'Cursor', status: 'in_progress', source: 'checksheet' },
  { id: 'cs-6', title: 'Root cause the flow', owner: 'Software', status: 'in_progress', source: 'checksheet' },
  { id: 'p-1', title: 'President note', owner: 'QA bot', status: 'in_progress', source: 'president' }
] };
const items = () => L.parseItems(STATUS.items);
const openCount = owner => STATUS.items.filter(i => i.source === 'checksheet' && i.status !== 'done' && i.owner === owner).length;

test('desk card count equals the bot\'s open checksheet card count, display names and renamed bots included', () => {
  assert.equal(L.deskCards(items(), 'QA', idOf).length, openCount('QA bot'), 'owner "QA bot" is the QA desk');
  assert.equal(L.deskCards(items(), 'HR', idOf).length, openCount('HR - Bot Trainer'), 'owner "HR - Bot Trainer" is the HR desk');
  assert.equal(L.deskCards(items(), 'Cursor', idOf).length, 2, 'cards owned by "Software" (old name) land on the Cursor desk');
  assert.equal(L.deskCards(items(), 'Desk X', n => (n === 'Desk X' || n === 'Cursor' ? 'b0178cd7' : '')).length, 2, 'or by matching bot id');
  assert.equal(L.deskCards(items(), 'Gauge', idOf).length, 0);
});
test('a closed card leaves the desk (status done or its PR merged)', () => {
  const its = items(); assert.equal(L.deskCards(its, 'QA', idOf).length, 2);
  its.find(i => i.id === 'cs-1').status = 'done';
  assert.deepEqual(L.deskCards(its, 'QA', idOf).map(i => i.id), ['cs-2']);
  its.find(i => i.id === 'cs-2').prState = 'merged';
  assert.equal(L.deskCards(its, 'QA', idOf).length, 0);
});
test('a new card starts the carry: board -> desk, held in hand, and only then on the desk', () => {
  const [ev] = L.diffItems(items(), items().concat(L.parseItems([{ id: 'cs-9', title: 'New card', owner: 'QA bot', status: 'queued', source: 'checksheet' }])));
  assert.deepEqual([ev.bot, ev.itemId, ev.reason], ['QA', 'cs-9', 'new']);
  assert.ok(L.JOB_ASSIGN_REASONS.includes(ev.reason), 'queued as a job: walk to the board, take the card');
  let job = L.jobStart(ev.itemId, 0); assert.equal(L.jobGoal(job), 'board');
  job = L.jobStep(job, { arrived: true, heldFor: L.JOB_HOLD_S, now: 3 }); assert.equal(L.jobGoal(job), 'desk');
  assert.match(office, /if \(j\.phase === 'receive'\) c\.carry = true;/, 'the card is in hand for the walk to the desk');
  assert.match(office, /if \(j\.phase === 'deliver'\) return \{ key, spot: d\.seat, pose: 'sit' \};/, 'no typing: holding a card is not working');
  const withNew = items().concat(L.parseItems([{ id: 'cs-9', title: 'New card', owner: 'QA bot', status: 'queued', source: 'checksheet' }]));
  assert.equal(L.deskCards(withNew, 'QA', idOf, new Set(['cs-9'])).length, 2, 'not on the desk while carried');
  assert.equal(L.deskCards(withNew, 'QA', idOf).length, 3, 'on the desk once set down');
  assert.match(office, /for \(const d of desks\) syncCards\(d\);/);
});
test('pile follows the bot: QA and President neat, Claude and Sniffer messy; cards readable in 1-2 trimmed lines', () => {
  assert.deepEqual(['QA bot', 'President', 'Claude', 'Sniffer'].map(L.cardStyle), ['neat', 'neat', 'messy', 'messy']);
  assert.ok(['neat', 'messy'].includes(L.cardStyle('Root')));
  const neat = L.cardStack(5, 'neat', 'QA bot'), messy = L.cardStack(9, 'messy', 'Claude');
  assert.equal(new Set(neat.map(s => s.x + ',' + s.z + ',' + s.rot)).size, 1); assert.ok(neat[4].y > neat[0].y);
  assert.ok(new Set(messy.map(s => s.x.toFixed(2))).size >= 3 && messy.some(s => Math.abs(s.rot) > 0.1));
  for (const s of neat.concat(messy)) assert.ok(s.x > -0.79 && s.x < -0.23 && s.z > 0.1 && s.z < 0.36, 'on the desktop, clear of the keyboard');
  const lines = L.cardLines('Physical cards carried from the board to desk stacks with personality');
  assert.ok(lines.length === 2 && lines.every(l => l.length <= 18) && lines[1].endsWith('…'));
  assert.deepEqual(L.cardLines('Short'), ['Short']);
});
