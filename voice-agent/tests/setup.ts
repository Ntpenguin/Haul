// Runs before test files are imported, so config picks these up.
process.env.NODE_ENV = 'test';
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'test-admin-token';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://postgres@localhost:5432/openvoice_test';
process.env.LOG_LEVEL = 'error';
// Keyless brain for tests (simulator, SMS agent).
process.env.STT_PROVIDER = 'mock';
process.env.LLM_PROVIDER = 'mock';
process.env.TTS_PROVIDER = 'mock';
