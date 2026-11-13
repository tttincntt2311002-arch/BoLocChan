import react from 'eslint-plugin-react'
import hooks from 'eslint-plugin-react-hooks'

export default [
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: Object.fromEntries(
        [
          'window',
          'document',
          'localStorage',
          'Event',
          'FormData',
          'URL',
          'URLSearchParams',
          'Blob',
          'AbortController',
          'TextEncoder',
          'crypto',
          'setInterval',
          'clearInterval',
          'setTimeout',
          'clearTimeout',
          'navigator',
        ].map((name) => [name, 'readonly']),
      ),
    },
    plugins: { react, 'react-hooks': hooks },
    settings: { react: { version: '18.3' } },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^React$' },
      ],
      'react/jsx-uses-vars': 'error',
      ...hooks.configs.recommended.rules,
    },
  },
]
