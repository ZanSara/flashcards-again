#!/usr/bin/env -S node --experimental-strip-types
// Apply SQL migrations from `supabase/migrations/*.sql` to the configured
// Postgres database, tracking which ones have already been applied in a
// `_migrations` table so re-runs are no-ops.
//
// Usage:
//   DATABASE_URL=postgres://... npm run migrate
//
// To get the connection string for a hosted Supabase project, go to:
//   Project → Settings → Database → Connection string (URI)
// and use the "Transaction Pooler" (port 6543) string. Replace the password
// placeholder with your DB password from the same page.
//
// Flags:
//   --dry-run            Print which migrations would be applied, but do not run.
//   --status             Print applied / pending state and exit.
//   --reset              Drop the `_migrations` table (does NOT undo applied SQL).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');

type Args = { dryRun: boolean; status: boolean; reset: boolean };
function parseArgs(argv: string[]): Args {
	return {
		dryRun: argv.includes('--dry-run'),
		status: argv.includes('--status'),
		reset: argv.includes('--reset')
	};
}

function loadEnvFile(path: string): Record<string, string> {
	let raw: string;
	try {
		raw = readFileSync(path, 'utf-8');
	} catch {
		return {};
	}
	const out: Record<string, string> = {};
	for (const lineRaw of raw.split('\n')) {
		const line = lineRaw.trim();
		if (!line || line.startsWith('#')) continue;
		const eq = line.indexOf('=');
		if (eq < 0) continue;
		const key = line.slice(0, eq).trim();
		let value = line.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		out[key] = value;
	}
	return out;
}

function getConnectionString(): string {
	// Pull DATABASE_URL from the env or .env, in that order of precedence.
	const fromProcess = process.env.DATABASE_URL;
	if (fromProcess && fromProcess.trim()) return fromProcess;

	const envFile = loadEnvFile(join(ROOT, '.env'));
	if (envFile.DATABASE_URL && envFile.DATABASE_URL.trim()) return envFile.DATABASE_URL;

	throw new Error(
		[
			'No DATABASE_URL found.',
			'',
			'Add it to your .env file. From your Supabase project:',
			'  Project → Settings → Database → Connection string → URI (Transaction Pooler).',
			'  Replace [YOUR-PASSWORD] with the DB password (top of the same page).',
			'',
			'Example:',
			'  DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres',
			''
		].join('\n')
	);
}

function listMigrations(): { name: string; path: string; sql: string }[] {
	let entries: string[];
	try {
		entries = readdirSync(MIGRATIONS_DIR);
	} catch {
		throw new Error(`migrations directory not found: ${MIGRATIONS_DIR}`);
	}
	const files = entries
		.filter((n) => n.endsWith('.sql'))
		.filter((n) => statSync(join(MIGRATIONS_DIR, n)).isFile())
		.sort();
	return files.map((name) => {
		const path = join(MIGRATIONS_DIR, name);
		return { name, path, sql: readFileSync(path, 'utf-8') };
	});
}

async function ensureMigrationsTable(client: Client): Promise<void> {
	await client.query(`
		create table if not exists _migrations (
			name text primary key,
			applied_at timestamptz not null default now(),
			checksum text
		)
	`);
}

function checksum(sql: string): string {
	// Tiny stable hash; we don't need cryptographic strength here, just enough
	// to spot a migration file changing after it was applied.
	let h = 5381;
	for (let i = 0; i < sql.length; i++) {
		h = ((h * 33) ^ sql.charCodeAt(i)) >>> 0;
	}
	return h.toString(16).padStart(8, '0');
}

function explainConnectError(conn: string, err: unknown): string {
	const msg = err instanceof Error ? err.message : String(err);
	const url = (() => {
		try {
			return new URL(conn);
		} catch {
			return null;
		}
	})();
	const hints: string[] = [msg];
	if (msg.includes('EHOSTUNREACH') || msg.includes('ENETUNREACH')) {
		const isDirect = url?.hostname.startsWith('db.') ?? false;
		hints.push('');
		hints.push("Your network couldn't reach the database host.");
		if (isDirect) {
			hints.push(
				'You are using the DIRECT connection (host starts with "db."), which is IPv6-only on Supabase free tier.'
			);
			hints.push(
				'Switch to the Session Pooler (free, IPv4): in the Supabase dashboard go to'
			);
			hints.push(
				'  Settings → Database → Connection string → Session Pooler → URI,'
			);
			hints.push(
				'and use the URL shown there. Username becomes "postgres.<project-ref>",'
			);
			hints.push('host becomes "aws-0-<region>.pooler.supabase.com", port stays 5432.');
		} else {
			hints.push('Verify the host/port is reachable from your network (try `nc -vz <host> <port>`).');
		}
	} else if (msg.includes('password authentication failed')) {
		hints.push('');
		hints.push(
			'Wrong DB password. Reset it in: Supabase dashboard → Settings → Database → Reset password.'
		);
		hints.push('Make sure to URL-encode any special characters in the password.');
	} else if (msg.toLowerCase().includes('tenant or user not found')) {
		hints.push('');
		hints.push(
			'When using the pooler, the username MUST be "postgres.<project-ref>", not just "postgres".'
		);
	}
	return hints.join('\n');
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const conn = getConnectionString();

	const client = new Client({
		connectionString: conn,
		ssl: { rejectUnauthorized: false }
	});
	try {
		await client.connect();
	} catch (e) {
		throw new Error(explainConnectError(conn, e));
	}

	try {
		if (args.reset) {
			await client.query('drop table if exists _migrations');
			console.log('dropped _migrations table (applied SQL was NOT undone).');
			return;
		}

		await ensureMigrationsTable(client);
		const migrations = listMigrations();
		const { rows: appliedRows } = await client.query<{
			name: string;
			applied_at: Date;
			checksum: string | null;
		}>('select name, applied_at, checksum from _migrations');
		const appliedByName = new Map(appliedRows.map((r) => [r.name, r]));

		if (args.status) {
			console.log(`migrations dir: ${MIGRATIONS_DIR}`);
			console.log(`migrations on disk: ${migrations.length}`);
			console.log(`migrations applied: ${appliedByName.size}`);
			console.log('');
			for (const m of migrations) {
				const applied = appliedByName.get(m.name);
				const cs = checksum(m.sql);
				if (!applied) {
					console.log(`  [PENDING] ${m.name}  (checksum ${cs})`);
				} else if (applied.checksum && applied.checksum !== cs) {
					console.log(
						`  [DRIFT]   ${m.name}  (applied ${applied.applied_at.toISOString()}, on-disk checksum ${cs} != stored ${applied.checksum})`
					);
				} else {
					console.log(`  [OK]      ${m.name}  (applied ${applied.applied_at.toISOString()})`);
				}
			}
			return;
		}

		const pending = migrations.filter((m) => !appliedByName.has(m.name));
		if (pending.length === 0) {
			console.log('Nothing to do — all migrations applied.');
			return;
		}

		// Warn (but don't fail) if a previously-applied file's contents changed.
		for (const m of migrations) {
			const applied = appliedByName.get(m.name);
			if (applied?.checksum && applied.checksum !== checksum(m.sql)) {
				console.warn(
					`warning: ${m.name} was applied previously but its content has changed on disk.`
				);
				console.warn(
					'  This script will NOT re-run it. Author a new migration with your changes.'
				);
			}
		}

		console.log(`Applying ${pending.length} migration${pending.length === 1 ? '' : 's'}…`);
		for (const m of pending) {
			console.log(`  → ${m.name}`);
			if (args.dryRun) continue;
			try {
				await client.query('begin');
				await client.query(m.sql);
				await client.query(
					'insert into _migrations (name, checksum) values ($1, $2) on conflict (name) do nothing',
					[m.name, checksum(m.sql)]
				);
				await client.query('commit');
			} catch (e) {
				await client.query('rollback').catch(() => {});
				console.error(`failed: ${m.name}`);
				throw e;
			}
		}
		if (args.dryRun) {
			console.log('Dry run complete. No changes applied.');
		} else {
			console.log('Done.');
		}
	} finally {
		await client.end();
	}
}

main().catch((e) => {
	console.error(e instanceof Error ? e.message : String(e));
	process.exit(1);
});
