const fs = require('fs');
const path = require('path');

function safeKey(key) {
  const value = String(key || '').replace(/^\/+/, '');
  if (!value || value.includes('..')) throw new Error('Invalid object storage key.');
  return value;
}

class LocalObjectStorage {
  constructor(rootDir) {
    this.rootDir = path.resolve(rootDir || path.join(process.cwd(), 'data', 'objects'));
    fs.mkdirSync(this.rootDir, { recursive: true });
    this.driver = 'local';
  }

  resolvePath(key) {
    const target = path.resolve(this.rootDir, safeKey(key));
    if (!target.startsWith(this.rootDir + path.sep) && target !== this.rootDir) {
      throw new Error('Object key escapes storage root.');
    }
    return target;
  }

  async putObject({ key, body, contentType = 'application/octet-stream' }) {
    const objectKey = safeKey(key);
    const target = this.resolvePath(objectKey);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    await fs.promises.writeFile(target, buffer);
    return { key: objectKey, size: buffer.length, contentType };
  }

  async getObjectBuffer(key) {
    return fs.promises.readFile(this.resolvePath(key));
  }

  async exists(key) {
    try {
      await fs.promises.access(this.resolvePath(key), fs.constants.F_OK);
      return true;
    } catch (_) {
      return false;
    }
  }

  async deleteObject(key) {
    try { await fs.promises.unlink(this.resolvePath(key)); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

class S3ObjectStorage {
  constructor() {
    const {
      S3Client,
      PutObjectCommand,
      GetObjectCommand,
      DeleteObjectCommand,
      HeadObjectCommand
    } = require('@aws-sdk/client-s3');

    this.bucket = String(process.env.S3_BUCKET || '').trim();
    if (!this.bucket) throw new Error('S3_BUCKET is required when STORAGE_DRIVER=s3.');

    const accessKeyId = String(process.env.AWS_ACCESS_KEY_ID || '').trim();
    const secretAccessKey = String(process.env.AWS_SECRET_ACCESS_KEY || '').trim();
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for R2/S3 storage.');
    }

    this.client = new S3Client({
      region: process.env.S3_REGION || 'auto',
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE || '') === '1',
      credentials: { accessKeyId, secretAccessKey }
    });
    this.commands = { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand };
    this.driver = 's3';
  }

  async putObject({ key, body, contentType = 'application/octet-stream' }) {
    const objectKey = safeKey(key);
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    await this.client.send(new this.commands.PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      Body: buffer,
      ContentType: contentType
    }));
    return { key: objectKey, size: buffer.length, contentType };
  }

  async getObjectBuffer(key) {
    const out = await this.client.send(new this.commands.GetObjectCommand({
      Bucket: this.bucket,
      Key: safeKey(key)
    }));
    const chunks = [];
    for await (const chunk of out.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  async exists(key) {
    try {
      await this.client.send(new this.commands.HeadObjectCommand({
        Bucket: this.bucket,
        Key: safeKey(key)
      }));
      return true;
    } catch (error) {
      if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') return false;
      throw error;
    }
  }

  async deleteObject(key) {
    await this.client.send(new this.commands.DeleteObjectCommand({
      Bucket: this.bucket,
      Key: safeKey(key)
    }));
  }
}

let cached;

function getObjectStorage() {
  if (cached) return cached;
  const driver = String(process.env.STORAGE_DRIVER || 'local').toLowerCase();
  cached = driver === 's3'
    ? new S3ObjectStorage()
    : new LocalObjectStorage(process.env.LOCAL_STORAGE_DIR);
  return cached;
}

function tenantObjectKey({ tenantId, branchId = null, category, entityId = null, filename }) {
  if (!tenantId || !category || !filename) throw new Error('tenantId, category and filename are required.');
  const parts = ['tenants', safeKey(String(tenantId))];
  if (branchId) parts.push('branches', safeKey(String(branchId)));
  parts.push(safeKey(String(category)));
  if (entityId) parts.push(safeKey(String(entityId)));
  parts.push(safeKey(String(filename)));
  return parts.join('/');
}

module.exports = { getObjectStorage, tenantObjectKey, LocalObjectStorage, S3ObjectStorage };
