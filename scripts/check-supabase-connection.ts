import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(2);
}

const supabase = createClient(url, key);

async function main() {
  try {
    // Try a harmless request. Replace 'student' with a table you have.
    const { data, error, status } = await supabase
      .from('student')
      .select('studentid')
      .limit(1);

    if (error) {
      console.error('Supabase responded with an error:', error);
      process.exit(1);
    }
    console.log('Supabase request succeeded; sample response:', data);
  } catch (e) {
    console.error('Network/connection error:', e);
    process.exit(1);
  }
}

main();