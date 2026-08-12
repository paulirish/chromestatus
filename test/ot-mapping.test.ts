import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('OT Mapping JSON Validation', async () => {
  const mappingPath = path.resolve(process.cwd(), 'data', 'ot-mapping.json');
  
  // 1. Verify file exists
  let fileText: string;
  try {
    fileText = await fs.readFile(mappingPath, 'utf8');
  } catch (err) {
    assert.fail(`data/ot-mapping.json was not found or could not be read: ${err}`);
  }

  // 2. Verify valid JSON
  const data = JSON.parse(fileText);
  assert.equal(typeof data, 'object', 'Mapping root must be a JSON object');
  assert.notEqual(data, null, 'Mapping root must not be null');

  // 3. Verify unmapped key is present and is an array
  assert.equal(Array.isArray(data.unmapped), true, 'unmapped property must be an array');
  
  // 4. Verify mapped symbols exist and have valid chromestatus_url
  const keys = Object.keys(data).filter(k => k !== 'unmapped');
  assert.equal(keys.length > 0, true, 'Must have at least one mapped symbol key');

  for (const key of keys) {
    const value = data[key];
    assert.equal(typeof value, 'object', `Mapped symbol value for "${key}" must be an object`);
    assert.notEqual(value, null, `Mapped symbol value for "${key}" must not be null`);
    assert.equal(typeof value.chromestatus_url, 'string', `Mapped symbol "${key}" must contain chromestatus_url string`);
    assert.match(value.chromestatus_url, /^https:\/\/chromestatus\.com\/feature\/\d+$/, `Mapped symbol "${key}" must have a valid ChromeStatus URL format`);
  }

  // 5. Verify unmapped array elements
  for (const entry of data.unmapped) {
    assert.equal(typeof entry, 'object', 'Unmapped array entry must be an object');
    assert.notEqual(entry, null, 'Unmapped array entry must not be null');
    assert.equal(typeof entry.name, 'string', 'Unmapped array entry must have a name string');
    assert.equal(typeof entry.chromestatus_url, 'string', 'Unmapped array entry must have a chromestatus_url string');
    assert.match(entry.chromestatus_url, /^https:\/\/chromestatus\.com\/feature\/\d+$/, 'Unmapped array entry must have a valid ChromeStatus URL format');
  }

  // 6. Verify specific expected mapped keys are present
  assert.ok('canvas-html' in data, 'canvas-html must be a mapped symbol key');
  assert.ok('declarative-webmcp' in data, 'declarative-webmcp must be a mapped symbol key');
});
