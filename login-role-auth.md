# Login & Role-Based Authentication (Admin & Surgeon Portal)

## Goal
Implement a login page and role-based authentication separating ASC Administrators (accessing the full ASC Command Center) and Surgeons (accessing a dedicated Surgeon Portal), with database support for the `users` table and surgeon credentials from the `surgeons` table.

## Tasks
- [ ] Task 1: Update `schema_setup.sql` with `public.users` table, RLS policies, and seed admin user → Verify: SQL script contains valid DDL and insert statement.
- [ ] Task 2: Implement authentication methods in `src/lib/supabase.js` (`login`, `getCurrentUser`, `logout`, fallback handling) → Verify: Can authenticate admin and surgeon against DB or graceful fallbacks.
- [ ] Task 3: Create modern `LoginPage.jsx` & CSS with Admin and Surgeon tabs, demo credentials quick-fill, and error messaging → Verify: Render login form, toggle roles, submit credentials.
- [ ] Task 4: Create dedicated `SurgeonPortal.jsx` & CSS with surgeon-specific case logs, upcoming OR schedule, personal performance metrics, and preference cards → Verify: Displays personalized surgeon dashboard.
- [ ] Task 5: Integrate Auth state, protected views, and logout button into `src/App.jsx` → Verify: Unauthenticated shows Login, Admin loads Command Center, Surgeon loads Surgeon Portal.
- [ ] Task 6: Verify end-to-end authentication flows (Admin login, Surgeon login, Logout, Session restore on page reload) → Verify: Test both roles in browser and verify seamless transition.

## Done When
- [ ] Unauthenticated users are presented with a medical-grade ASC login screen.
- [ ] Logging in as Admin grants full access to ASC Command Center with user badge and logout in sidebar.
- [ ] Logging in as a Surgeon directs immediately to the dedicated Surgeon Portal displaying only their data.
- [ ] Session is persisted in localStorage so refresh does not force re-login.
- [ ] Default credentials and quick-login helpers work out of the box for testing.
