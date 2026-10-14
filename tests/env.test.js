import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEnvironment, EnvironmentConfigurationError } from '../src/lib/env.js';

test('Environment Validator - Missing VITE_SUPABASE_URL', () => {
  const invalidEnv = {
    VITE_SUPABASE_ANON_KEY: 'mock-anon-key'
  };

  assert.throws(
    () => validateEnvironment(invalidEnv),
    (err) => {
      assert(err instanceof EnvironmentConfigurationError);
      assert(err.missingKeys.includes('VITE_SUPABASE_URL'));
      return true;
    }
  );
});

test('Environment Validator - Missing or Placeholder VITE_SUPABASE_ANON_KEY', () => {
  const placeholderEnv = {
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'placeholder'
  };

  assert.throws(
    () => validateEnvironment(placeholderEnv),
    (err) => {
      assert(err instanceof EnvironmentConfigurationError);
      assert(err.missingKeys.includes('VITE_SUPABASE_ANON_KEY'));
      return true;
    }
  );
});

test('Environment Validator - Invalid URL Protocol', () => {
  const invalidUrlEnv = {
    VITE_SUPABASE_URL: 'ftp://insecure-host.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'valid-token'
  };

  assert.throws(
    () => validateEnvironment(invalidUrlEnv),
    (err) => {
      assert(err instanceof EnvironmentConfigurationError);
      assert(err.message.includes('must be a valid HTTPS URL'));
      return true;
    }
  );
});

test('Environment Validator - Valid Development Configuration', () => {
  const validDevEnv = {
    VITE_SUPABASE_URL: 'https://valid-project.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'valid-anon-token',
    VITE_APP_ENV: 'development',
    VITE_APP_VERSION: '2026.10.1',
    VITE_ENABLE_DEMO_AUTH: 'true'
  };

  const parsed = validateEnvironment(validDevEnv);
  assert.equal(parsed.supabaseUrl, 'https://valid-project.supabase.co');
  assert.equal(parsed.supabaseAnonKey, 'valid-anon-token');
  assert.equal(parsed.appEnv, 'development');
  assert.equal(parsed.appVersion, '2026.10.1');
  assert.equal(parsed.isProduction, false);
  assert.equal(parsed.isDevelopment, true);
  assert.equal(parsed.enableDemoAuth, true);
});

test('Environment Validator - Production Mode Disables Demo Auth', () => {
  const prodEnvWithDemo = {
    VITE_SUPABASE_URL: 'https://production-project.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'valid-prod-token',
    VITE_APP_ENV: 'production',
    VITE_ENABLE_DEMO_AUTH: 'true' // Attempted override
  };

  const parsed = validateEnvironment(prodEnvWithDemo);
  assert.equal(parsed.isProduction, true);
  assert.equal(parsed.enableDemoAuth, false, 'Production mode must force enableDemoAuth to false');
});

test('Environment Validator - Production Mode Rejects Legacy Development URL', () => {
  const prodEnvWithDevUrl = {
    VITE_SUPABASE_URL: 'https://xeqbfrxoozaltcxvitfa.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'valid-prod-token',
    PROD: true
  };

  assert.throws(
    () => validateEnvironment(prodEnvWithDevUrl),
    (err) => {
      assert(err instanceof EnvironmentConfigurationError);
      assert(err.message.includes('Production build detected unauthorized legacy development Supabase project URL'));
      return true;
    }
  );
});

test('Environment Validator - Localhost and 127.0.0.1 Endpoints Allowed for Dev', () => {
  const localEnv = {
    VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
    VITE_SUPABASE_ANON_KEY: 'local-anon-token'
  };

  const parsed = validateEnvironment(localEnv);
  assert.equal(parsed.supabaseUrl, 'http://127.0.0.1:54321');
  assert.equal(parsed.isDevelopment, true);
});

test('Environment Validator - Error Screen Contract (Multiple Missing Keys)', () => {
  const emptyEnv = {};

  assert.throws(
    () => validateEnvironment(emptyEnv),
    (err) => {
      assert(err instanceof EnvironmentConfigurationError);
      assert.equal(err.name, 'EnvironmentConfigurationError');
      assert.deepEqual(err.missingKeys.sort(), ['VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL'].sort());
      assert(err.message.includes('VITE_SUPABASE_URL'));
      assert(err.message.includes('VITE_SUPABASE_ANON_KEY'));
      return true;
    }
  );
});

test('Supabase Proxy Guard - Throws on API access when unconfigured but permits inspection', () => {
  const unconfiguredProxy = new Proxy({}, {
    get(target, prop) {
      if (typeof prop === 'symbol' || prop === 'toJSON' || prop === 'then' || prop === '$$typeof') {
        return undefined;
      }
      throw new Error(`Supabase client.${String(prop)} accessed without valid environment configuration.`);
    }
  });

  // Safe inspection symbols return undefined
  assert.equal(unconfiguredProxy.then, undefined);
  assert.equal(unconfiguredProxy.toJSON, undefined);
  assert.equal(unconfiguredProxy[Symbol.toStringTag], undefined);

  // Real method access throws descriptive error
  assert.throws(
    () => unconfiguredProxy.from('surgeries'),
    /Supabase client\.from accessed without valid environment configuration\./
  );
  assert.throws(
    () => unconfiguredProxy.auth.signInWithPassword(),
    /Supabase client\.auth accessed without valid environment configuration\./
  );
});

