<script lang="ts">
	let {
		onRecording,
		disabled = false
	}: { onRecording: (blob: Blob) => void; disabled?: boolean } = $props();

	let recorder: MediaRecorder | null = null;
	let chunks: Blob[] = [];
	let recording = $state(false);
	let errorMsg = $state<string | null>(null);

	async function start() {
		errorMsg = null;
		try {
			const stream = await globalThis.navigator.mediaDevices.getUserMedia({ audio: true });
			const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
			chunks = [];
			mr.ondataavailable = (e) => {
				if (e.data && e.data.size > 0) chunks.push(e.data);
			};
			mr.onstop = () => {
				const blob = new Blob(chunks, { type: 'audio/webm' });
				stream.getTracks().forEach((t) => t.stop());
				onRecording(blob);
			};
			mr.start();
			recorder = mr;
			recording = true;
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Microphone access denied';
		}
	}

	function stop() {
		recorder?.stop();
		recorder = null;
		recording = false;
	}
</script>

{#if !recording}
	<button
		type="button"
		class="btn-primary"
		{disabled}
		aria-label="Start recording"
		onclick={start}
	>
		Record
	</button>
{:else}
	<button
		type="button"
		class="btn bg-rose-600 text-white hover:bg-rose-500"
		aria-label="Stop recording"
		onclick={stop}
	>
		Stop
	</button>
{/if}

{#if errorMsg}
	<p class="text-xs text-rose-600 dark:text-rose-400">{errorMsg}</p>
{/if}
