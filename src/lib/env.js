/**
 * src/lib/env.js
 * Centralized, validated environment configuration module for ASCANALYST.
 * Executes synchronously during application bootstrapping.
 */

export class EnvironmentConfigurationError extends Error {
  constructor(message, missingKeys = []) {
    super(message);
    this.name = 'EnvironmentConfigurationError';
    this.missingKeys = missingKeys;
  }
}

/**
 * Validates environment variables from the given source or defaults to runtime environment.
 * @param {Record<string, any>} [envSource] - Optional environment map (for testing).
 * @returns {Object} Validated environment configuration object.
 */
export function validateEnvironment(envSource) {
  const env = envSource || (
    typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env
      : (typeof globalThis !== 'undefined' && globalThis.process?.env ? globalThis.process.env : {})
  );

  const missing = [];
  const invalid = [];

  const requiredKeys = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

  for (const key of requiredKeys) {
    const val = env[key];
    if (!val || typeof val !== 'string' || val.trim() === '' || val === 'placeholder') {
      missing.push(key);
    }
  }

  const supabaseUrl = env.VITE_SUPABASE_URL;
  if (supabaseUrl && typeof supabaseUrl === 'string') {
    const trimmedUrl = supabaseUrl.trim();
    const isValidUrl =
      trimmedUrl.startsWith('https://') ||
      trimmedUrl.startsWith('http://127.0.0.1') ||
      trimmedUrl.startsWith('http://localhost');
    if (!isValidUrl) {
      invalid.push('VITE_SUPABASE_URL must be a valid HTTPS URL or local development endpoint.');
    }
  }

  // Determine production mode
  const isProduction = Boolean(
    env.PROD === true ||
    env.VITE_APP_ENV === 'production' ||
    env.NODE_ENV === 'production'
  );

  // Security guard: In production, disallow legacy development project URL
  if (isProduction && supabaseUrl && typeof supabaseUrl === 'string' && supabaseUrl.includes('xeqbfrxoozaltcxvitfa')) {
    invalid.push('Production build detected unauthorized legacy development Supabase project URL.');
  }

  if (missing.length > 0 || invalid.length > 0) {
    const errorDetails = [
      missing.length > 0 ? `Missing required environment variables: ${missing.join(', ')}` : '',
      invalid.length > 0 ? `Invalid configuration: ${invalid.join('; ')}` : ''
    ].filter(Boolean).join('. ');

    throw new EnvironmentConfigurationError(errorDetails, missing);
  }

  // In production, demo auth is unconditionally disabled
  const enableDemoAuth = isProduction ? false : env.VITE_ENABLE_DEMO_AUTH === 'true';

  return {
    supabaseUrl: env.VITE_SUPABASE_URL?.trim(),
    supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY?.trim(),
    appEnv: env.VITE_APP_ENV || (isProduction ? 'production' : 'development'),
    appVersion: env.VITE_APP_VERSION || '0.0.0',
    isProduction,
    isDevelopment: !isProduction,
    enableDemoAuth
  };
}

let cachedEnv = null;
let envError = null;

try {
  cachedEnv = validateEnvironment();
} catch (err) {
  envError = err;
}

export const ENV = cachedEnv || {};
export const ENV_ERROR = envError;
