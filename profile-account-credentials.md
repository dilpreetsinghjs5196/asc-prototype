# Profile & Account Credentials Management

## Goal
Add a top-right header account icon with dropdown menu (Profile & Logout) and a dedicated full-page "Profile & Account" tab to view and modify user credentials (name, email, phone, role/specialty, and password) with database persistence.

## Tasks
- [ ] Task 1: Add `updateUser` method in `src/lib/supabase.js` to support updating admin user credentials in `public.users` table and updating local session → Verify: Database query updates user and returns new state.
- [ ] Task 2: Create `UserProfile.jsx` and `UserProfile.css` for the dedicated full-page Profile & Account management screen → Verify: Form renders with personal info, change password fields, and validation.
- [ ] Task 3: Add top-right compact avatar icon and dropdown menu in `src/App.jsx` and `src/components/SurgeonPortal.jsx` → Verify: Dropdown opens/closes on click, shows user details, link to Profile, and Logout.
- [ ] Task 4: Integrate the dedicated Profile tab (`activeTab === 'profile'`) into `App.jsx` and `SurgeonPortal.jsx` → Verify: Clicking "My Profile" opens the dedicated profile screen, updates persist to DB and session.
- [ ] Task 5: Verify end-to-end credential modification and logout flows → Verify: Test updating credentials and password, verify session refresh and re-login with new password.

## Done When
- [ ] Compact avatar button appears in the top-right header next to the time filters.
- [ ] Clicking avatar opens a polished dropdown menu with user profile link and logout option.
- [ ] Selecting "My Profile" navigates to the dedicated Profile & Account screen.
- [ ] User can update their name, email, phone, and password, and changes persist to the database.
