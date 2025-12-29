import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// Client thông thường
export const supabase = createClient(supabaseUrl, supabaseKey);

// Admin client
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
