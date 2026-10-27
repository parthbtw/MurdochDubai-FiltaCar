import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'filtacar-case-study-'));
process.env.FILTA_DATA_DIR = directory;
const { createApp } = await import('../src/index.js');
const { runChecks } = await import('../src/checks/index.js');
const { importCsv } = await import('../src/csvImport.js');
const partsFile = path.join(directory, 'parts.json');
const baselineFile = path.join(directory, 'manual_baseline.json');
const seeds = JSON.parse(fs.readFileSync(new URL('../../data/parts.json', import.meta.url), 'utf8'));
const app = createApp({ ai: { config: { apiKey: '', liveEnabled: false }, cliPath: null } });
const save = parts => fs.writeFileSync(partsFile, JSON.stringify(parts));

beforeEach(() => {
  const parts = structuredClone(seeds);
  for (const part of parts) Object.assign(part, runChecks(part));
  save(parts);
  fs.rmSync(baselineFile, { force: true });
});
after(() => fs.rmSync(directory, { recursive: true, force: true }));

test('seller filter scopes business and individual sellers, composes with status, and handles unknown sellers', async () => {
  const parts = JSON.parse(fs.readFileSync(partsFile, 'utf8'));
  parts[0].seller_id = 'INDIVIDUAL-1';
  save(parts);
  const all = (await request(app).get('/api/parts')).body.parts;
  assert.equal(all.length, 10);
  const individual = (await request(app).get('/api/parts?seller_id=INDIVIDUAL-1')).body.parts;
  assert.deepEqual(individual.map(part => part.item_id), ['MIR-0001']);
  const business = (await request(app).get('/api/parts?seller_id=DXB-SLV-014&status=ready_for_review')).body.parts;
  assert.deepEqual(business.map(part => part.item_id), ['MIR-0002', 'MIR-0003']);
  const metrics = (await request(app).get('/api/metrics?seller_id=INDIVIDUAL-1')).body;
  assert.equal(metrics.parts_total, 1);
  assert.deepEqual(metrics.by_status, { ready_for_review: 1, information_missing: 0, specialist_review_required: 0 });
  assert.deepEqual((await request(app).get('/api/parts?seller_id=unknown')).body.parts, []);
  const empty = (await request(app).get('/api/metrics?seller_id=unknown')).body;
  assert.equal(empty.parts_total, 0);
  assert.equal(empty.approved, 0);
  assert.equal(empty.questions_open, 0);
  assert.deepEqual(empty.by_status, { ready_for_review: 0, information_missing: 0, specialist_review_required: 0 });
});

test('metrics start with no seed timing and compute valid odd and even elapsed-time medians only', async () => {
  assert.deepEqual((await request(app).get('/api/metrics')).body.measured, { approved_with_timing: 0, median_minutes_to_approval: null });
  const timed = (minutes, seller_id = 'S') => ({ seller_id, created_at: '2026-10-27T10:00:00.000Z',
    seller_approval: { approved: true, approved_at: new Date(Date.parse('2026-10-27T10:00:00.000Z') + minutes * 60000).toISOString() } });
  save([timed(10), timed(2), timed(6), timed(100, 'OTHER'),
    { created_at: 'invalid', seller_approval: { approved_at: '2026-10-27T10:00:00Z' } },
    { created_at: '2026-10-27T10:00:00Z', seller_approval: { approved_at: 'invalid' } },
    { seller_approval: { approved_at: '2026-10-27T10:00:00Z' } }, timed(-2)]);
  const before = fs.readFileSync(partsFile, 'utf8');
  assert.deepEqual((await request(app).get('/api/metrics?seller_id=S')).body.measured, { approved_with_timing: 3, median_minutes_to_approval: 6 });
  assert.deepEqual((await request(app).get('/api/metrics')).body.measured, { approved_with_timing: 4, median_minutes_to_approval: 8 });
  assert.equal(fs.readFileSync(partsFile, 'utf8'), before);
  save([timed(0)]);
  assert.deepEqual((await request(app).get('/api/metrics')).body.measured, { approved_with_timing: 1, median_minutes_to_approval: 0 });
});

test('optional baseline is reread when present and only a complete measured comparison replaces assumptions', async () => {
  const initial = (await request(app).get('/api/metrics')).body;
  assert.equal(initial.baseline, undefined);
  assert.equal(initial.time_estimate.source, 'assumption');
  const baseline = { parts: 4, total_minutes: 40, measured_on: '2026-10-27', method: 'Synthetic timing fixture, not a real measurement' };
  fs.writeFileSync(baselineFile, JSON.stringify(baseline));
  const present = (await request(app).get('/api/metrics')).body;
  assert.deepEqual(present.baseline, { minutes_per_listing: 10, measured_on: baseline.measured_on, method: baseline.method });
  assert.equal(present.time_estimate.source, 'assumption');
  save([{ created_at: '2026-10-27T10:00:00Z', seller_approval: { approved: true, approved_at: '2026-10-27T10:04:00Z' } }]);
  const measured = (await request(app).get('/api/metrics')).body;
  assert.equal(measured.time_estimate.source, 'measured');
  assert.equal(measured.time_estimate.manual_minutes_per_listing, 10);
  assert.equal(measured.time_estimate.filtacar_minutes_per_listing, 4);
  fs.writeFileSync(baselineFile, JSON.stringify({ ...baseline, parts: 0 }));
  assert.equal((await request(app).get('/api/metrics')).body.baseline, undefined);
});

test('CSV import parses new fields, sources every field and creation timestamp, and preserves existing values', async () => {
  const csv = Buffer.from('item_id,make,model,year,side,part_number,storage_location,weight_kg,length_cm,width_cm,height_cm,included_components\nTEST-NEW,Test,Mirror,2017,Right,TEST-123,Rack TEST Bay 2,2.4,40,26,22,mirror glass; housing; connector\n');
  const response = await request(app).post('/api/upload').attach('sheet', csv, 'synthetic.csv');
  assert.equal(response.status, 200);
  const part = response.body.parts[0];
  assert.equal(new Date(part.created_at).toISOString(), part.created_at);
  assert.equal(part.field_sources.created_at, 'server record creation');
  assert.equal(part.storage_location, 'Rack TEST Bay 2');
  assert.equal(part.weight_kg, 2.4);
  assert.deepEqual(part.packaged_dimensions_cm, { length: 40, width: 26, height: 22 });
  assert.deepEqual(part.included_components, ['mirror glass', 'housing', 'connector']);
  for (const field of ['storage_location', 'weight_kg', 'packaged_dimensions_cm.length', 'packaged_dimensions_cm.width', 'packaged_dimensions_cm.height', 'included_components']) {
    assert.equal(part.field_sources[field], 'spreadsheet row 1 (synthetic.csv)');
  }
  assert.equal(part.field_sources.actions_required, 'runChecks');
  assert.ok(Array.isArray(part.actions_required));
  assert.ok(!JSON.stringify(part.draft).includes(part.storage_location));
  const parts = [part];
  importCsv(parts, Buffer.from('item_id,weight_kg,length_cm,included_components\nTEST-NEW,3,45,camera\n'), 'conflict.csv');
  assert.equal(part.weight_kg, 2.4);
  assert.equal(part.packaged_dimensions_cm.length, 40);
  assert.deepEqual(part.included_components, ['mirror glass', 'housing', 'connector']);
  assert.equal(part.candidates.weight_kg.value, 3);
  assert.deepEqual(part.candidates.included_components.value, ['camera']);
  assert.equal(part.created_at, response.body.parts[0].created_at);
});

test('actions and created_at are protected; seller edits save computed actions and update new field provenance', async () => {
  for (const patch of [{ actions_required: [] }, { created_at: '2026-10-01T00:00:00Z' }]) {
    assert.equal((await request(app).put('/api/parts/MIR-0005').send(patch)).status, 400);
  }
  const response = await request(app).put('/api/parts/MIR-0005').send({ weight_kg: 2.2, packaged_dimensions_cm: { length: 40, width: 26, height: 22 } });
  assert.equal(response.status, 200);
  assert.equal(response.body.field_sources.weight_kg, 'seller edit');
  assert.equal(response.body.field_sources.packaged_dimensions_cm, 'seller edit');
  assert.equal(response.body.field_sources.actions_required, 'runChecks');
  assert.ok(!response.body.actions_required.some(action => ['weight_kg', 'packaged_dimensions_cm'].includes(action.field)));
  assert.deepEqual((await request(app).get('/api/parts/MIR-0005')).body.actions_required, response.body.actions_required);
});

test('approval records checklist approval last and storage never reaches the mock export or Sources', async () => {
  const parts = JSON.parse(fs.readFileSync(partsFile, 'utf8'));
  parts[0].field_sources.storage_location = 'private rack source not for listing';
  parts[0].field_sources.included_components = 'synthetic component source';
  save(parts);
  assert.equal((await request(app).post('/api/parts/MIR-0005/approve')).status, 409);
  const approved = await request(app).post('/api/parts/MIR-0001/approve');
  assert.equal(approved.status, 200);
  assert.equal(approved.body.corridor.checklist.items.find(item => item.id === 'seller_approval').status, 'pass');
  assert.equal(approved.body.field_sources['seller_approval.approved_at'], 'server approval timestamp');
  const exported = await request(app).get('/api/export/ebay.csv');
  assert.equal(exported.status, 200);
  assert.ok(exported.text.includes('synthetic component source'));
  assert.ok(!exported.text.includes('private rack source not for listing'));
  assert.ok(!exported.text.includes(parts[0].storage_location));
  assert.ok(!exported.text.includes('storage_location'));
});

test('real seller correction routes preserve MIR-0004, MIR-0007 and MIR-0010 journeys', async () => {
  for (const [id, patch, expected] of [
    ['MIR-0004', { part_details: { part_number: { extracted_value: 'TEST-PJ14' } } }, 'ready_for_review'],
    ['MIR-0007', { donor_vehicle: { year: 2015 } }, 'ready_for_review'],
    ['MIR-0010', { part_details: { part_number: { extracted_value: 'SBM-7946-PX' } } }, 'specialist_review_required'],
  ]) {
    const response = await request(app).put(`/api/parts/${id}`).send(patch);
    assert.equal(response.status, 200);
    assert.equal(response.body.readiness_status, expected);
  }
});
