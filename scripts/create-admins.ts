import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { supabase } from '../src/lib/supabase.js';
import adminAccounts from '../src/admins.js';
dotenv.config();

async function run() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
    process.exit(1);
  }

  for (const admin of adminAccounts) {
    try {
      const email = admin.email.toLowerCase();
      console.log(`Processing ${email}`);

      const passwordHash = await bcrypt.hash(admin.password, 12);

      const { data: staff, error: staffErr } = await supabase
        .from('admin_staff')
        .insert({
          email,
          staffFirstName: admin.staffFirstName ?? email.split('@')[0],
          staffLastName: admin.staffLastName ?? 'Admin',
          role: admin.role ?? 'admin',
          encrypted_password: passwordHash,
        })
        .select('staffID, email')
        .single();

      if (staffErr) {
        console.error(`Failed to create admin_staff for ${email}:`, staffErr.message || staffErr);
      } else {
        console.log(`Created admin_staff ${staff.email} (staffID=${staff.staffID})`);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
    }
  }

  console.log('Done');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
