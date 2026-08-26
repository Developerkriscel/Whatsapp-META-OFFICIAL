import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      WHATSAPP_MOCK_MODE: 'true',
      CREDENTIALS_ENCRYPTION_KEY: 'test-encryption-key-not-for-production-use',
    },
  },
});
