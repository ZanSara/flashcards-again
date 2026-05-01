import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Cookies } from '@sveltejs/kit';
import type { Database } from '$lib/database.types';
import { publicSupabaseAnonKey, publicSupabaseUrl, supabaseServiceRole } from './env';

let adminClient: SupabaseClient<Database> | null = null;

/** Server-side admin client; bypasses RLS. Use only in trusted server code. */
export function getAdminClient(): SupabaseClient<Database> {
	if (!adminClient) {
		adminClient = createClient<Database>(publicSupabaseUrl(), supabaseServiceRole(), {
			auth: { persistSession: false, autoRefreshToken: false }
		});
	}
	return adminClient;
}

/** Per-request server client that reads/writes auth cookies — respects RLS. */
export function createRequestClient(cookies: Cookies): SupabaseClient<Database> {
	return createServerClient<Database>(publicSupabaseUrl(), publicSupabaseAnonKey(), {
		cookies: {
			getAll: () => cookies.getAll(),
			setAll: (toSet) => {
				for (const { name, value, options } of toSet) {
					cookies.set(name, value, { ...options, path: options?.path ?? '/' });
				}
			}
		}
	});
}
