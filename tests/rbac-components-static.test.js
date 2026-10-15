import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('RBAC Components & Security Invariants Static Verification', async (t) => {
  await t.test('1. UserProfile.jsx eliminates cleartext password update write', () => {
    const userProfileSrc = fs.readFileSync(path.join(rootDir, 'src/components/UserProfile.jsx'), 'utf8');
    assert.ok(
      !userProfileSrc.includes('updates.password = newPassword'),
      'UserProfile must never assign plaintext password to public table updates'
    );
    assert.ok(
      userProfileSrc.includes('db.updatePassword(newPassword.trim())'),
      'UserProfile must delegate password changes to db.updatePassword via GoTrue'
    );
  });

  await t.test('2. RoleGate.jsx exists and enforces role & permission boundaries', () => {
    const roleGateSrc = fs.readFileSync(path.join(rootDir, 'src/components/RoleGate.jsx'), 'utf8');
    assert.ok(roleGateSrc.includes('export default function RoleGate'), 'RoleGate component must export default function');
    assert.ok(roleGateSrc.includes('allowedRoles'), 'RoleGate must accept allowedRoles prop');
    assert.ok(roleGateSrc.includes('requiredPermission'), 'RoleGate must accept requiredPermission prop');
    assert.ok(roleGateSrc.includes('rbacService.hasPermission'), 'RoleGate must use rbacService.hasPermission');
  });

  await t.test('3. UserManagement.jsx implements Last Admin safeguard and role filtering', () => {
    const userMgmtSrc = fs.readFileSync(path.join(rootDir, 'src/components/UserManagement.jsx'), 'utf8');
    assert.ok(userMgmtSrc.includes('Administrative Safeguard'), 'UserManagement must alert on Last Admin deactivation');
    assert.ok(userMgmtSrc.includes('activeAdmins.length <= 1'), 'UserManagement must guard against deactivating sole facility admin');
    assert.ok(userMgmtSrc.includes('CANONICAL_ROLES'), 'UserManagement must reference canonical roles');
  });

  await t.test('4. RoleManagement.jsx implements 13-domain matrix and system immutability locks', () => {
    const roleMgmtSrc = fs.readFileSync(path.join(rootDir, 'src/components/RoleManagement.jsx'), 'utf8');
    assert.ok(roleMgmtSrc.includes('System Built-In'), 'RoleManagement must display System Built-In lock badge');
    assert.ok(roleMgmtSrc.includes('permissionsByDomain'), 'RoleManagement must group permissions by functional domain');
    assert.ok(roleMgmtSrc.includes('createCustomRole'), 'RoleManagement must support custom role creation');
  });

  await t.test('5. MultiAgentConsole.jsx guards onSchedule execution with role authority check', () => {
    const multiAgentSrc = fs.readFileSync(path.join(rootDir, 'src/components/MultiAgentConsole.jsx'), 'utf8');
    assert.ok(multiAgentSrc.includes('canCommitSchedule'), 'MultiAgentConsole must pre-check canCommitSchedule');
    assert.ok(
      multiAgentSrc.includes("!['viewer', 'biller', 'coder'].includes(userRole)"),
      'MultiAgentConsole must prohibit viewer, biller, and coder from scheduling writes'
    );
  });

  await t.test('6. App.jsx wires UserManagement and RoleManagement under RoleGate', () => {
    const appSrc = fs.readFileSync(path.join(rootDir, 'src/App.jsx'), 'utf8');
    assert.ok(appSrc.includes('<UserManagement'), 'App.jsx must render UserManagement component');
    assert.ok(appSrc.includes('<RoleManagement'), 'App.jsx must render RoleManagement component');
    assert.ok(appSrc.includes("activeTab === 'user_management'"), 'App.jsx must handle user_management tab');
    assert.ok(appSrc.includes("activeTab === 'role_management'"), 'App.jsx must handle role_management tab');
    assert.ok(appSrc.includes('CANONICAL_ROLES.find'), 'App.jsx must dynamically resolve canonical role names');
  });
});
