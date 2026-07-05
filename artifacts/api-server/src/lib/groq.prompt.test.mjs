import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const promptPath = path.join(__dirname, 'groq.ts');
const source = readFileSync(promptPath, 'utf8');

test('Venus prompt includes direct-verdict instructions for real decision forks and binary questions', () => {
  assert.match(source, /multi-option verdict breakdown/i);
  assert.match(source, /single top-line verdict/i);
  assert.match(source, /Do not force a verdict format/i);
  assert.match(source, /short, informal, or fragmentary/i);
  assert.match(source, /treat short phrases like/i);
  assert.match(source, /weigh how strongly each stated option is supported or undermined/i);
  assert.match(source, /Do not default to 60\/40|70\/30/i);
});
