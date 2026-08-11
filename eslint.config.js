import js from '@eslint/js';
import globals from 'globals';
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  {
    ignores: ['**/dist/**', '**/node_modules/**']
  },
  {
    files: ['web/src/**/*.{ts,svelte}', 'web/test/**/*.ts'],
    languageOptions: {
      globals: globals.browser
    }
  },
  {
    files: ['web/src/**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser
      }
    }
  },
  {
    files: ['server/src/mcp.ts'],
    rules: {
      // The MCP layer must see only AgentPort. Importing the room reducer,
      // the player view, or RoomState directly would make it easy to leak
      // live room state to the agent by accident.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@egress/core',
              importNames: ['applyAction', 'playerView', 'RoomState'],
              message: 'mcp.ts may only see AgentPort — go through server/src/agentPort.ts.'
            }
          ],
          patterns: [
            {
              group: ['@egress/core/room', '@egress/core/view', '**/core/room', '**/core/view'],
              message: 'mcp.ts may only see AgentPort — go through server/src/agentPort.ts.'
            }
          ]
        }
      ]
    }
  }
);
