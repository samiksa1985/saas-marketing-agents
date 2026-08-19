import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocaleContext, localeDirection, translate } from './index.js';

test('supports Arabic RTL and English LTR locales', () => {
  assert.equal(localeDirection('ar-SA'), 'rtl');
  assert.equal(localeDirection('en-US'), 'ltr');
  assert.equal(createLocaleContext('ar-SA').language, 'ar');
  assert.notEqual(translate('ar-SA', 'app.title'), 'app.title');
});
