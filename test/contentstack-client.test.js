import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSupportedEnvironments } from '../scripts/lib/config.js';
import { ContentstackClient } from '../scripts/lib/contentstack.js';

test('uses cookie auth and publishes with the entry version', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const json = url.endsWith('/publish') ? { notice: 'ok' } : { entry: { uid: 'blttest', _version: 2 } };
    return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = new ContentstackClient({
    fetchImpl,
    env: { CS_API_KEY: 'bltstack', CS_AUTHTOKEN: 'session-token', CS_CMA_BASE_URL: 'https://app.contentstack.com/api/v3' }
  });
  await client.getEntry('expertAdvicePage', 'blttest');
  await client.publishEntry('richText', 'blttest', 2, ['development']);
  assert.equal(calls[0].options.headers.Cookie, 'authtoken=session-token');
  assert.equal(calls[0].options.headers.api_key, 'bltstack');
  assert.equal(calls[0].options.headers.authorization, undefined);
  assert.equal(calls[0].options.headers.authtoken, undefined);
  assert.equal(calls[1].url, 'https://app.contentstack.com/api/v3/content_types/richText/entries/blttest/publish');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    entry: { environments: ['development'], locales: ['en-us'] }, locale: 'en-us', version: 2
  });
});

test('validates publish environments and rejects targets outside the expert advice set', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ environments: [
    { uid: 'bltdev', name: 'development' },
    { uid: 'bltprod', name: 'production' },
    { uid: 'bltdev2', name: 'dev' }
  ] }), { status: 200, headers: { 'content-type': 'application/json' } });
  const client = new ContentstackClient({ fetchImpl, env: { CS_API_KEY: 'bltstack', CS_AUTHTOKEN: 'session-token' } });
  const resolved = await client.validateEnvironments(['development', 'bltprod', 'bltdev']);
  assert.deepEqual(resolved, [{ name: 'development', uid: 'bltdev' }, { name: 'production', uid: 'bltprod' }]);
  await assert.rejects(() => client.validateEnvironments(['staging']), /"staging" does not exist/);
  assert.throws(() => assertSupportedEnvironments([{ name: 'dev', uid: 'bltdev2' }]), /not supported/);
});

test('lists assets in the folder named by the document', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    return new Response(JSON.stringify({
      count: 1,
      assets: [{ uid: 'a1', filename: 'hero.png', is_dir: false }, { uid: 'folder', is_dir: true, filename: 'nested' }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = new ContentstackClient({ fetchImpl, env: { CS_API_KEY: 'bltstack', CS_AUTHTOKEN: 'session-token' } });
  const assets = await client.listFolderAssets('blta5172dec2dcd9599');
  assert.deepEqual(assets.map(asset => asset.uid), ['a1']);
  assert.match(calls[0], /parent_uid/);
  assert.match(calls[0], /blta5172dec2dcd9599/);
  assert.match(calls[0], /include_publish_details=true/);
});
