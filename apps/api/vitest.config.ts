import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// NestJS relies on `emitDecoratorMetadata` for dependency injection, which
// esbuild (Vitest's default transformer) does not emit. unplugin-swc bridges
// the gap so NestJS DI works inside Vitest.
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    restoreMocks: true,
  },
});
