"use strict";

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { config } = require("../config");

let client;

function isConfigured() {
  return Boolean(
    config.s3.endpoint
    && config.s3.bucket
    && config.s3.accessKeyId
    && config.s3.secretAccessKey
  );
}

function getClient() {
  if (!isConfigured()) {
    throw new Error("Object Storage (S3) ist nicht konfiguriert — .env prüfen.");
  }
  if (!client) {
    client = new S3Client({
      region: config.s3.region,
      endpoint: config.s3.endpoint,
      forcePathStyle: config.s3.forcePathStyle,
      credentials: {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey
      }
    });
  }
  return client;
}

async function putObject(storageKey, body, mimeType) {
  const c = getClient();
  await c.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: storageKey,
      Body: body,
      ContentType: mimeType || "application/octet-stream"
    })
  );
}

async function getSignedDownloadUrl(storageKey, expiresInSec = 3600) {
  if (config.s3.publicBaseUrl) {
    const base = config.s3.publicBaseUrl.replace(/\/$/, "");
    return `${base}/${storageKey}`;
  }
  const c = getClient();
  return getSignedUrl(
    c,
    new GetObjectCommand({ Bucket: config.s3.bucket, Key: storageKey }),
    { expiresIn: expiresInSec }
  );
}

async function getObjectBuffer(storageKey) {
  const c = getClient();
  const out = await c.send(
    new GetObjectCommand({ Bucket: config.s3.bucket, Key: storageKey })
  );
  const body = out.Body;
  if (!body) return Buffer.alloc(0);
  if (typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  const chunks = [];
  for await (const chunk of body) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function deleteObject(storageKey) {
  const c = getClient();
  await c.send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: storageKey }));
}

module.exports = {
  isConfigured,
  putObject,
  getSignedDownloadUrl,
  getObjectBuffer,
  deleteObject
};
