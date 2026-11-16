import { webConfig } from '@triage/tooling/eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default webConfig([
  {
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'error' },
  },
]);
