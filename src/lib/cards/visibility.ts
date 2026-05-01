import type { ExtraField, ExtraVisibility } from '$lib/database.types';

export type Side = 'front' | 'back';

/** Should an extras field be rendered on the given side? */
export function isVisibleOn(field: ExtraField, side: Side): boolean {
	const v: ExtraVisibility = field.visibility;
	if (v === 'hidden') return false;
	if (v === 'manual') return false; // manual is shown via click-to-reveal chips
	if (v === 'both') return true;
	return v === side;
}

/** Group extras by display_hint for the renderer. */
export function groupByHint(fields: ExtraField[], side: Side) {
	const inline: ExtraField[] = [];
	const block: ExtraField[] = [];
	const badgeFront: ExtraField[] = [];
	const badgeBack: ExtraField[] = [];
	const subtle: ExtraField[] = [];
	const manual: ExtraField[] = [];

	for (const f of fields) {
		if (f.visibility === 'hidden') continue;
		if (f.visibility === 'manual') {
			manual.push(f);
			continue;
		}
		if (!isVisibleOn(f, side)) continue;
		const hint = f.display_hint ?? 'inline';
		if (hint === 'inline') inline.push(f);
		else if (hint === 'block') block.push(f);
		else if (hint === 'subtle') subtle.push(f);
		else if (hint === 'badge') {
			// front_language → top-left, back_language → top-right; default to top-right
			if (f.key.toLowerCase().includes('front')) badgeFront.push(f);
			else badgeBack.push(f);
		}
	}
	return { inline, block, badgeFront, badgeBack, subtle, manual };
}
