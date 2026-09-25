// Run with the backend serving DiscountMate_IQ_Test:
// node --test tests/iq-api-smoke.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');

const base = process.env.IQ_TEST_API_URL || 'http://localhost:3000/api';

async function products(query) {
  const response = await fetch(`${base}/products?${new URLSearchParams(query)}`);
  assert.equal(response.status, 200, `products request failed: ${response.status}`);
  return response.json();
}

test('homepage browse uses the live product API', async () => {
  const data = await products({ page: '1', limit: '9' });
  assert.equal(data.total, 27, 'start the backend with MONGO_DB_NAME=DiscountMate_IQ_Test');
  assert.equal(data.totalPages, 3);
  assert.equal(data.items.length, 9);
  assert.ok(data.items.every(item => item.product_code?.startsWith('IQ-TEST-')));
});

test('search, retailer, price range and sort are applied together', async () => {
  const data = await products({ search: 'Milk', retailers: 'coles', minPrice: '0', maxPrice: '5', sort: 'price_desc', page: '1', limit: '9' });
  assert.equal(data.total, 2);
  assert.deepEqual(data.items.map(item => item.product_name), ['Milk Test 04', 'Milk Test 01']);
  assert.ok(data.items.every(item => item.coles_price <= 5));
});

test('page 2 has different items and preserves the search query', async () => {
  const [first, second] = await Promise.all([
    products({ search: 'Test', page: '1', limit: '9', sort: 'name_asc' }),
    products({ search: 'Test', page: '2', limit: '9', sort: 'name_asc' }),
  ]);
  assert.equal(first.total, 27);
  assert.equal(second.total, 27);
  assert.equal(second.page, 2);
  assert.equal(second.items.length, 9);
  assert.ok(first.items.every(a => second.items.every(b => String(a._id) !== String(b._id))));
});

test('invalid query values return a consistent client error', async () => {
  for (const query of [{ page: '0' }, { sort: 'unknown' }, { minPrice: '-1' }]) {
    const response = await fetch(`${base}/products?${new URLSearchParams(query)}`);
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.ok(Array.isArray(body.errors) && body.errors.length > 0);
  }
});

test('an unmatched search returns a clear empty result', async () => {
  const data = await products({ search: 'IQ_NO_MATCH_999', page: '1', limit: '9' });
  assert.deepEqual(data.items, []);
  assert.equal(data.total, 0);
  assert.equal(data.totalPages, 0);
});
