import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

// All env access is lazy. SvelteKit's prerender / analyse passes import server
// modules with no env vars set, so reading at module load would crash the
// build. Each accessor only throws when it's first dereferenced at request
// time.

function required(name: string, value: string | undefined): string {
	if (!value || value.trim() === '') {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

function optional(value: string | undefined, fallback: string): string {
	return value && value.trim() !== '' ? value : fallback;
}

export function publicSupabaseUrl() {
	return required('PUBLIC_SUPABASE_URL', publicEnv.PUBLIC_SUPABASE_URL);
}
export function publicSupabaseAnonKey() {
	// Newer Supabase projects ship a PUBLIC_SUPABASE_PUBLISHABLE_KEY; both names
	// map to the same RLS-respecting client-side key.
	const v = publicEnv.PUBLIC_SUPABASE_ANON_KEY ?? publicEnv.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
	return required('PUBLIC_SUPABASE_ANON_KEY (or PUBLIC_SUPABASE_PUBLISHABLE_KEY)', v);
}
export function supabaseServiceRole() {
	return required('SUPABASE_SERVICE_ROLE', env.SUPABASE_SERVICE_ROLE);
}
export function openaiApiKey() {
	// Accept OpenRouter / other OpenAI-compatible providers via OPENAI_API_KEY,
	// or via OPENROUTER_API_KEY if the user prefers that name.
	const v = env.OPENAI_API_KEY ?? env.OPENROUTER_API_KEY;
	return required('OPENAI_API_KEY (or OPENROUTER_API_KEY)', v);
}

export function openaiBaseURL(): string | undefined {
	// If OPENAI_BASE_URL is set, route through it (OpenRouter, Ollama, etc.).
	// If only OPENROUTER_API_KEY is set, default to OpenRouter's base URL.
	const explicit = env.OPENAI_BASE_URL;
	if (explicit && explicit.trim()) return explicit;
	if (!env.OPENAI_API_KEY && env.OPENROUTER_API_KEY) {
		return 'https://openrouter.ai/api/v1';
	}
	return undefined;
}
export function soloOwnerSecret() {
	return required('SOLO_OWNER_SECRET', env.SOLO_OWNER_SECRET);
}

export function openaiChatModel() {
	return optional(env.OPENAI_CHAT_MODEL ?? env.OPENROUTER_CHAT_MODEL, 'gpt-4o-mini');
}
export function openaiTtsModel() {
	return optional(env.OPENAI_TTS_MODEL ?? env.OPENROUTER_TTS_MODEL, 'gpt-4o-mini-tts');
}
export function openaiTtsVoice() {
	return optional(env.OPENAI_TTS_VOICE ?? env.OPENROUTER_TTS_VOICE, 'alloy');
}
export function phonemeBackend() {
	return optional(env.PHONEME_BACKEND, 'wav2vec2phoneme');
}
export function phonemeServerUrl() {
	return optional(env.PHONEME_SERVER_URL, 'http://phoneme-server:8000');
}
export function pronunciationBackend() {
	return optional(env.PRONUNCIATION_BACKEND, 'sidecar');
}
export function speechaceApiKey() {
	return env.SPEECHACE_API_KEY ?? '';
}
