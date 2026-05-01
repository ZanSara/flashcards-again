// Hand-written types mirroring the SQL schema in `supabase/migrations`.
// Regenerate via `supabase gen types typescript` once the project is linked.
//
// IMPORTANT: row types are `type` aliases, not `interface`. The Supabase v2
// PostgrestClient checks that `Schema['Tables'][k]` extends `GenericTable`,
// which requires `Row extends Record<string, unknown>`. TypeScript interfaces
// do NOT implicitly satisfy `Record<string, unknown>` (a long-standing quirk
// — see microsoft/TypeScript#15300), but type aliases with the same shape do.

export type NoteKind = 'word' | 'phrase' | 'sentence';
export type NoteStatus = 'pending' | 'active' | 'archived';
export type NoteSource = 'manual' | 'llm';

export type CardType =
	| 'basic'
	| 'basic_reversed'
	| 'cloze'
	| 'audio_recognition'
	| 'audio_choice'
	| 'pronunciation';

export type ExampleSentenceStatus = 'queued' | 'current' | 'used';

export type ExtraVisibility = 'front' | 'back' | 'both' | 'manual' | 'hidden';
export type ExtraType = 'text' | 'ipa' | 'audio_ref' | 'translation' | 'example' | 'note';
export type ExtraDisplayHint = 'inline' | 'block' | 'badge' | 'subtle';

export type ExtraField = {
	key: string;
	value: string;
	type: ExtraType;
	visibility: ExtraVisibility;
	display_hint?: ExtraDisplayHint;
};

export type ClozeVariant = {
	cloze_index: number;
	direction: 'recognize' | 'produce';
	reveal: 'full_translation' | 'target_translation_only' | 'both';
	source: 'note_front' | 'example_sentence';
};

export type AudioVariant = {
	source: 'note_front' | 'example_sentence';
};

export type PronunciationVariant = {
	source: 'note_front' | 'example_sentence';
};

export type CardVariant =
	| Record<string, never>
	| ClozeVariant
	| AudioVariant
	| PronunciationVariant;

export type NoteRow = {
	id: string;
	user_id: string;
	created_at: string;
	updated_at: string;
	note_kind: NoteKind;
	front: string;
	back: string | null;
	extras: ExtraField[];
	tags: string[];
	properties: Record<string, unknown>;
	source: NoteSource;
	status: NoteStatus;
	card_type_overrides: Partial<Record<CardType, boolean>>;
};

export type ExampleSentenceRow = {
	id: string;
	note_id: string;
	user_id: string;
	created_at: string;
	text: string;
	translation: string;
	target_translation: string;
	status: ExampleSentenceStatus;
};

export type CardRow = {
	id: string;
	note_id: string;
	user_id: string;
	card_type: CardType;
	variant: CardVariant;
	priority: number;
	due: string;
	stability: number;
	difficulty: number;
	state: number;
	last_review: string | null;
	reps: number;
	lapses: number;
	step: number;
	created_at: string;
};

export type ReviewRow = {
	id: string;
	card_id: string;
	user_id: string;
	rating: number;
	reviewed_at: string;
	elapsed_ms: number;
	prev_state: Record<string, unknown>;
	new_state: Record<string, unknown>;
	example_sentence_id: string | null;
};

export type MediaRow = {
	sha256: string;
	user_id: string;
	mime: string;
	bytes: number;
	storage_path: string;
	kind: 'tts' | 'user_recording';
	created_at: string;
};

export type NoteMediaRow = {
	note_id: string;
	media_sha256: string;
	purpose: string;
};

export type IpaCacheRow = {
	text: string;
	lang: string;
	backend_vocab: string;
	phonemes: string;
	created_at: string;
};

export type SettingsRow = {
	user_id: string;
	daily_new_limit: number | null;
	pending_threshold: number;
	example_sentence_pool_size: number;
	tts_voice: string;
	default_extras: ExtraField[];
	fsrs_params: Record<string, unknown>;
	pronunciation_rating_thresholds: {
		good: number;
		hard: number;
		again: number;
	};
	updated_at: string;
};

type Tbl<R> = { Row: R; Insert: Partial<R>; Update: Partial<R>; Relationships: [] };

export type Database = {
	__InternalSupabase: { PostgrestVersion: '12' };
	public: {
		Tables: {
			notes: Tbl<NoteRow>;
			example_sentences: Tbl<ExampleSentenceRow>;
			cards: Tbl<CardRow>;
			reviews: Tbl<ReviewRow>;
			media: Tbl<MediaRow>;
			note_media: Tbl<NoteMediaRow>;
			ipa_cache: Tbl<IpaCacheRow>;
			settings: Tbl<SettingsRow>;
		};
		Views: { [_ in never]: never };
		Functions: { [_ in never]: never };
		Enums: {
			note_kind: NoteKind;
			note_status: NoteStatus;
			note_source: NoteSource;
			card_type: CardType;
			example_sentence_status: ExampleSentenceStatus;
		};
		CompositeTypes: { [_ in never]: never };
	};
};
