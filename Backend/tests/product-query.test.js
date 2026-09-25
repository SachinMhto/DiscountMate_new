// Place in Backend/tests/product-query.test.js and run: node --test tests/product-query.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const controllerPath = path.resolve(__dirname, '../src/controllers/product.controller.js');

function loadController(aggregate) {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'mongodb') return { ObjectId: class ObjectId { static isValid() { return false; } } };
    if (request === '../config/database' && parent?.filename === controllerPath) {
      return { getDb: () => ({ collection: () => ({ aggregate }) }) };
    }
    return originalLoad.apply(this, arguments);
  };
  try {
    delete require.cache[controllerPath];
    return require(controllerPath);
  } finally {
    Module._load = originalLoad;
  }
}

test('search and category stay active when requesting the next page', async () => {
  const pipelines = [];
  const { getProducts } = loadController((pipeline) => {
    pipelines.push(pipeline);
    return { toArray: async () => pipeline.some(stage => stage.$count) ? [{ total: 38 }] : [] };
  });
  let response;
  await getProducts(
    { query: { search: 'milk', category: 'Dairy', page: '2', limit: '9' } },
    { json: body => { response = body; return body; }, status: code => { throw Error(`HTTP ${code}`); } }
  );
  assert.equal(response.page, 2);
  assert.equal(response.pageSize, 9);
  assert.equal(response.total, 38);
  assert.equal(response.totalPages, 5);
  const itemPipeline = pipelines.find(p => p.some(stage => stage.$skip));
  const countPipeline = pipelines.find(p => p.some(stage => stage.$count));
  assert.deepEqual(itemPipeline.find(stage => stage.$skip), { $skip: 9 });
  assert.deepEqual(itemPipeline.find(stage => stage.$limit), { $limit: 9 });
  for (const pipeline of [itemPipeline, countPipeline]) {
    assert.ok(pipeline[0].$match.$or, 'search must remain in both queries');
    assert.ok(pipeline.some(stage => stage.$match?.['cat.category_name']), 'category must remain in both queries');
  }
});

test('sorting is applied to the full result set before pagination', async () => {
  const pipelines = [];
  const { getProducts } = loadController(pipeline => {
    pipelines.push(pipeline);
    return { toArray: async () => pipeline.some(s => s.$count) ? [{ total: 30 }] : [] };
  });
  await getProducts(
    { query: { search: 'milk', page: '2', limit: '9', sort: 'price_asc' } },
    { json: body => body, status: code => { throw Error(`HTTP ${code}`); } }
  );
  const pipeline = pipelines.find(p => p.some(s => s.$skip));
  const skipIndex = pipeline.findIndex(s => s.$skip !== undefined);
  assert.ok(
    pipeline.slice(0, skipIndex).some(s => s.$sort?.minPrice === 1),
    'price_asc must sort by product price before $skip; current backend sorts only by name'
  );
});

test('price and retailer filters affect both displayed items and total count', async () => {
  const pipelines = [];
  const { getProducts } = loadController(pipeline => {
    pipelines.push(pipeline);
    return { toArray: async () => pipeline.some(s => s.$count) ? [{ total: 2 }] : [] };
  });
  await getProducts(
    { query: { search: 'milk', minPrice: '5', maxPrice: '10', retailers: 'coles' } },
    { json: body => body, status: code => { throw Error(`HTTP ${code}`); } }
  );
  const [items, count] = [pipelines.find(p => p.some(s => s.$skip !== undefined)), pipelines.find(p => p.some(s => s.$count))];
  for (const pipeline of [items, count]) {
    assert.ok(
      pipeline.some(stage => JSON.stringify(stage).includes('latestColesPricing')),
      'retailer and price filters must use pricing data in both items and count queries'
    );
  }
});
