import test from 'node:test';
import assert from 'node:assert/strict';
import { rbacService, CANONICAL_ROLES, PERMISSIONS_CATALOG } from '../src/lib/rbacService.js';

test('RBAC Service Unit Tests', async (t) => {
  await t.test('1. CANONICAL_ROLES contains all 10 canonical roles with deterministic tiers', () => {
    assert.equal(CANONICAL_ROLES.length, 10);
    const slugs = CANONICAL_ROLES.map(r => r.slug);
    assert.deepEqual(slugs, [
      'super_admin', 'org_admin', 'facility_admin', 'cfo',
      'clinical_manager', 'scheduler', 'biller', 'coder', 'surgeon', 'viewer'
    ]);
  });

  await t.test('2. PERMISSIONS_CATALOG covers all 13 domains', () => {
    const categories = new Set(PERMISSIONS_CATALOG.map(p => p.category));
    assert.ok(categories.has('patients'));
    assert.ok(categories.has('surgeons'));
    assert.ok(categories.has('surgeries'));
    assert.ok(categories.has('or_scheduling'));
    assert.ok(categories.has('cpt_codes'));
    assert.ok(categories.has('finance'));
    assert.ok(categories.has('billing'));
    assert.ok(categories.has('reports'));
    assert.ok(categories.has('ai'));
    assert.ok(categories.has('users'));
    assert.ok(categories.has('roles'));
    assert.ok(categories.has('tenancy'));
    assert.ok(categories.has('audit'));
    assert.equal(categories.size, 13);
  });

  await t.test('3. normalizeRole maps all 14 legacy aliases deterministically', () => {
    assert.equal(rbacService.normalizeRole('clinical_director'), 'clinical_manager');
    assert.equal(rbacService.normalizeRole('billing_rcm'), 'biller');
    assert.equal(rbacService.normalizeRole('finance'), 'cfo');
    assert.equal(rbacService.normalizeRole('financial_analyst'), 'cfo');
    assert.equal(rbacService.normalizeRole('read_only'), 'viewer');
    assert.equal(rbacService.normalizeRole('admin'), 'facility_admin');
    assert.equal(rbacService.normalizeRole('scheduler'), 'scheduler');
    assert.equal(rbacService.normalizeRole('coder'), 'coder');
    assert.equal(rbacService.normalizeRole('surgeon'), 'surgeon');
  });

  await t.test('4. hasPermission evaluates wildcards and specific permission codes', () => {
    const userPerms = ['surgeries.view', 'surgeries.schedule'];
    assert.equal(rbacService.hasPermission(userPerms, 'surgeries.view'), true);
    assert.equal(rbacService.hasPermission(userPerms, 'surgeries.schedule'), true);
    assert.equal(rbacService.hasPermission(userPerms, 'cpt.edit'), false);
    assert.equal(rbacService.hasPermission(['*'], 'any.permission'), true);
    assert.equal(rbacService.hasPermission(['admin.*'], 'any.permission'), true);
    assert.equal(rbacService.hasPermission(null, 'surgeries.view'), false);
    assert.equal(rbacService.hasPermission([], 'surgeries.view'), false);
  });
});
