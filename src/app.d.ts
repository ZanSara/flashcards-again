import type { SupabaseClient, Session, User } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';

declare global {
	namespace App {
		interface Locals {
			supabase: SupabaseClient<Database>;
			supabaseAdmin: SupabaseClient<Database>;
			user: User | null;
			session: Session | null;
		}
		interface PageData {
			session: Session | null;
			user: User | null;
		}
	}
}

export {};
