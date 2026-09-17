const assert = require('assert');
const { safeRequestId } = require('../src/middleware/requestContext');

describe('request context', () => {
  it('keeps a safe caller request id for cross-service tracing', () => {
    assert.equal(safeRequestId('web-20260917-request-001'), 'web-20260917-request-001');
  });

  it('replaces unsafe request ids instead of reflecting them', () => {
    const generated = safeRequestId('bad id\r\nx-injected: true');
    assert.match(generated, /^[0-9a-f-]{36}$/i);
  });
});
