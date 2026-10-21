/**
 * JSON schemas of the live API responses (the OpenAPI document declares
 * `schema: {}` for every 2xx, so these were taken from real responses).
 */
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false });

export const ERROR = {
  type: 'object',
  required: ['detail'],
  properties: { detail: { type: 'string' }, fields: { type: 'array' } },
};

export const HEALTH = {
  type: 'object',
  required: ['status', 'version'],
  properties: { status: { const: 'ok' }, version: { type: 'string' } },
};

export const WORKSPACE = {
  type: 'object',
  required: ['token', 'expires_at'],
  properties: { token: { type: 'string', minLength: 16 }, expires_at: { type: 'string' } },
};

export const PRODUCT = {
  type: 'object',
  required: ['id', 'name', 'category', 'price', 'stock', 'description', 'specs', 'image'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    category: { enum: ['Audio', 'Workspace', 'Lifestyle'] },
    price: { type: 'integer', minimum: 0 },
    stock: { type: 'integer', minimum: 0 },
    description: { type: 'string' },
    specs: { type: 'object' },
    image: { type: 'string' },
  },
};

export const PRODUCTS = {
  type: 'object',
  required: ['items', 'total', 'page', 'limit'],
  properties: {
    items: { type: 'array', items: PRODUCT },
    total: { type: 'integer', minimum: 0 },
    page: { type: 'integer', minimum: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 20 },
  },
};

export const TOTALS = {
  type: 'object',
  required: ['subtotal', 'discount', 'shipping', 'total', 'currency'],
  properties: {
    subtotal: { type: 'integer', minimum: 0 },
    discount: { type: 'integer', minimum: 0 },
    shipping: { type: 'integer', minimum: 0 },
    total: { type: 'integer', minimum: 0 },
    currency: { const: 'UAH' },
  },
};

const LINE = {
  type: 'object',
  required: ['product_id', 'quantity'],
  properties: { product_id: { type: 'string' }, quantity: { type: 'integer', minimum: 1, maximum: 10 } },
};

export const ORDER = {
  type: 'object',
  required: ['id', 'status', 'items', 'totals', 'created_at'],
  properties: {
    id: { type: 'string', minLength: 1 },
    status: { enum: ['confirmed', 'cancelled'] },
    items: { type: 'array', minItems: 1, items: LINE },
    totals: TOTALS,
    created_at: { type: 'string' },
  },
};

export const ORDERS = {
  type: 'object',
  required: ['items'],
  properties: { items: { type: 'array', items: ORDER } },
};

export const FAVORITES = {
  type: 'object',
  required: ['product_ids'],
  properties: { product_ids: { type: 'array', maxItems: 16, items: { type: 'string' } } },
};

export const REVIEW = {
  type: 'object',
  required: ['review'],
  properties: {
    review: {
      oneOf: [
        { type: 'null' },
        {
          type: 'object',
          required: ['rating', 'text', 'created_at'],
          properties: {
            rating: { type: 'integer', minimum: 1, maximum: 5 },
            text: { type: 'string', minLength: 10, maxLength: 500 },
            created_at: { type: 'string' },
          },
        },
      ],
    },
  },
};

/** Chai-style assertion: throws with Ajv's error list when the body does not match. */
export function expectSchema(body, schema, label = 'response body') {
  const validate = ajv.compile(schema);
  const ok = validate(body);
  expect(ok, `${label} matches schema: ${JSON.stringify(validate.errors)}`).to.be.true;
}
