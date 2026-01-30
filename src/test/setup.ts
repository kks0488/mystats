import '@testing-library/jest-dom/vitest';

// `__APP_VERSION__` is provided by Vite `define` in the real build.
// In tests we define it on the global object to avoid ReferenceError.
(globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = 'test';
