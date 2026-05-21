import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL ?? '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// Warn instead of throw — throwing here crashes the entire serverless function on cold start
if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('[supabase] WARNING: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
}

export const supabase = createClient(supabaseUrl || 'https://fjwfgwfwbxjhdlovazqv.supabase.co', supabaseServiceRoleKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqd2Znd2Z3YnhqaGRsb3ZhenF2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTE3MDE5NywiZXhwIjoyMDk0NzQ2MTk3fQ.xX5JiER7u_RI4nuhgJaHtSlWF9cAEZvmUDha_MD6jeg', {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});