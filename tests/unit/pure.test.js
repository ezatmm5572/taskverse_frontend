// Dependency-free unit tests: `npm run test:unit` (node --test).
import test from 'node:test'
import assert from 'node:assert/strict'
import { renderRich, stripRich, handleOf, mentionsOf } from '../../src/services/richtext.js'
import { arExtra, arPatterns } from '../../src/services/i18n.ar.js'

test('richtext escapes HTML before formatting', () => {
  const html = renderRich('<img src=x onerror=alert(1)> **b**')
  assert.ok(!html.includes('<img'))
  assert.ok(html.includes('&lt;img'))
  assert.ok(html.includes('<strong>b</strong>'))
})

test('richtext only links http(s) urls', () => {
  assert.ok(!renderRich('[x](javascript:alert(1))').includes('href="javascript'))
  assert.ok(renderRich('[x](https://example.com)').includes('href="https://example.com"'))
})

test('mention handles drop spaces and fall back to the email name', () => {
  assert.equal(handleOf({ fname: 'Elena', lname: 'Rostova' }), 'ElenaRostova')
  assert.equal(handleOf({ email: 'sam@x.com' }), 'sam')
  assert.deepEqual(mentionsOf('hi @ElenaRostova and @nobody', ['ElenaRostova']), ['elenarostova'])
})

test('stripRich returns plain text', () => {
  assert.equal(stripRich('**Bold** _it_ `c`').trim(), 'Bold it c')
})

test('arabic dictionary has no empty values and patterns compile', () => {
  for (const [k, v] of Object.entries(arExtra)) assert.ok(v && v.trim(), `empty translation for "${k}"`)
  for (const [re, rep] of arPatterns) assert.ok(re instanceof RegExp && typeof rep === 'string')
  const hit = arPatterns.find(([re]) => re.test('Displaying latest 5 of 12 tasks'))
  assert.equal('Displaying latest 5 of 12 tasks'.replace(hit[0], hit[1]), 'عرض أحدث 5 من 12 مهمة')
})
