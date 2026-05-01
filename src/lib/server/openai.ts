import OpenAI from 'openai';
import {
	openaiApiKey,
	openaiBaseURL,
	openaiChatModel,
	openaiTtsModel,
	openaiTtsVoice
} from './env';

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
	if (!client) {
		const baseURL = openaiBaseURL();
		client = new OpenAI({ apiKey: openaiApiKey(), ...(baseURL ? { baseURL } : {}) });
	}
	return client;
}

export const Models = {
	get chat() {
		return openaiChatModel();
	},
	get tts() {
		return openaiTtsModel();
	},
	get ttsVoice() {
		return openaiTtsVoice();
	}
};
