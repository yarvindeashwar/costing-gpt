import { cleanEnv, str } from 'envalid';

// Fallback to default values if environment variables are not set
export const env = {
  // Use existing environment variables or fallback to defaults
  OPENAI_DEPLOYMENT: process.env.OPENAI_DEPLOYMENT || 'gpt-4',
  OPENAI_ENDPOINT: process.env.OPENAI_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT || '',
  OPENAI_KEY: process.env.OPENAI_KEY || process.env.AZURE_OPENAI_KEY || '',
  OPENAI_API_VERSION: process.env.OPENAI_API_VERSION || '2023-05-15'
};
