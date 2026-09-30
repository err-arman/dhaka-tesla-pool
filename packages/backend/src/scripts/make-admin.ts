// Grants the admin role to an existing account. An account holds exactly one role, so
// running this replaces their current role with `admin`. Usage: bun run make-admin user@example.com
import { pool } from '../db';
import { usersService } from '../api/users/users.service';

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error('Usage: bun run make-admin <email>');
  process.exit(1);
}

const user = await usersService.findByEmail(email);

if (!user) {
  console.error(`No user found with email ${email}`);
  await pool.end();
  process.exit(1);
}

await usersService.setRole(user.id, 'admin');
const updated = await usersService.findByEmail(email);

console.log(`${email} now has role: ${updated?.role}`);
console.log('Sign in again so the new access token carries the admin role.');

await pool.end();
