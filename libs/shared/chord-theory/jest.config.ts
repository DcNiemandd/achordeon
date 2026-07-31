export default {
  displayName: 'shared-chord-theory',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  moduleNameMapper: {
    '^@achordeon/shared/domain$': '<rootDir>/../domain/src/index.ts',
  },
  coverageDirectory: '../../../coverage/libs/shared/chord-theory',
};
