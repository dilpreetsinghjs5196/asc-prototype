import React from 'react';
import { rbacService } from '../lib/rbacService.js';
import { db } from '../lib/supabase.js';

/**
 * RoleGate component to conditionally render UI elements based on permissions or roles.
 */
export default function RoleGate({
  permission,
  requiredPermission,
  allowedRoles,
  userPermissions,
  fallback = null,
  children
}) {
  const targetPermission = permission || requiredPermission;
  const session = db.getSession();
  const userRole = rbacService.normalizeRole(session?.role);

  // 1. Role-based check if allowedRoles provided
  if (allowedRoles && Array.isArray(allowedRoles) && allowedRoles.length > 0) {
    const normalizedAllowed = allowedRoles.map(r => rbacService.normalizeRole(r));
    if (!normalizedAllowed.includes(userRole) && userRole !== 'super_admin') {
      return fallback;
    }
  }

  // 2. Permission-based check if permission code provided
  if (targetPermission) {
    const perms = userPermissions || (session?.permissions || []);
    // Super admin bypasses all specific permission gates
    if (userRole === 'super_admin') {
      return <>{children}</>;
    }

    if (perms.length > 0) {
      if (!rbacService.hasPermission(perms, targetPermission)) {
        return fallback;
      }
    } else {
      // Fallback heuristic based on role
      if (userRole === 'viewer' && !targetPermission.endsWith('.view') && !targetPermission.endsWith('.view_phi')) {
        return fallback;
      }
      if (['biller', 'coder'].includes(userRole) && targetPermission.startsWith('surgeries.schedule')) {
        return fallback;
      }
    }
  }

  return <>{children}</>;
}
