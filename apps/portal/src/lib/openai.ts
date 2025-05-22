import { AzureOpenAI } from 'openai';
import { env } from './env';

export const openai = new AzureOpenAI({
  apiKey: env.OPENAI_KEY,
  endpoint: env.OPENAI_ENDPOINT,
  deployment: env.OPENAI_DEPLOYMENT,
  apiVersion: '2023-05-15',
});
