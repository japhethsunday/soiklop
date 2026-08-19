import type { Config } from 'jest';

/**
 * Workspace Jest configuration.
 *
 * The upstream foundation shipped a config that imported `@nx/jest`, a package
 * that is not installed (Nx was removed but its config was left behind), so the
 * suite could not start at all. This replaces it with a self-contained ts-jest
 * setup covering the backend, the shared libraries and the React frontend.
 */
const tsconfigPaths = {
  '^@gitroom/backend/(.*)$': '<rootDir>/apps/backend/src/$1',
  '^@gitroom/frontend/(.*)$': '<rootDir>/apps/frontend/src/$1',
  '^@gitroom/helpers/(.*)$': '<rootDir>/libraries/helpers/src/$1',
  '^@gitroom/nestjs-libraries/(.*)$':
    '<rootDir>/libraries/nestjs-libraries/src/$1',
  '^@gitroom/react/(.*)$': '<rootDir>/libraries/react-shared-libraries/src/$1',
  '^@gitroom/orchestrator/(.*)$': '<rootDir>/apps/orchestrator/src/$1',
  '^@gitroom/extension/(.*)$': '<rootDir>/apps/extension/src/$1',
};

const tsJest: Config['transform'] = {
  '^.+\\.[tj]sx?$': [
    'ts-jest',
    {
      tsconfig: {
        target: 'es2020',
        module: 'commonjs',
        moduleResolution: 'node',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        strict: false,
        skipLibCheck: true,
        jsx: 'react-jsx',
        isolatedModules: true,
      },
      diagnostics: false,
    },
  ],
};

const config: Config = {
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      rootDir: __dirname,
      testMatch: [
        '<rootDir>/apps/backend/**/*.spec.ts',
        '<rootDir>/apps/orchestrator/**/*.spec.ts',
        '<rootDir>/libraries/**/*.spec.ts',
      ],
      moduleNameMapper: tsconfigPaths,
      transform: tsJest,
      setupFilesAfterEnv: ['<rootDir>/jest.setup.node.ts'],
    },
    {
      displayName: 'web',
      testEnvironment: 'jsdom',
      rootDir: __dirname,
      testMatch: ['<rootDir>/apps/frontend/**/*.spec.tsx'],
      moduleNameMapper: tsconfigPaths,
      transform: tsJest,
      setupFilesAfterEnv: ['<rootDir>/jest.setup.web.ts'],
      // Several frontend dependencies (@uppy/*, nanoid, and friends) ship ESM
      // only. Next.js transpiles them at build time; Jest's CJS runtime needs
      // them routed through the transform explicitly.
      transformIgnorePatterns: ['node_modules/(?!(@uppy|nanoid|@transloadit)/)'],
    },
  ],
  coverageDirectory: '<rootDir>/coverage',
  collectCoverageFrom: [
    'libraries/nestjs-libraries/src/**/*.ts',
    'apps/backend/src/**/*.ts',
    '!**/*.spec.ts',
    '!**/node_modules/**',
  ],
};

export default config;
