import "server-only";

// Object storage for admin uploads — the same Hetzner Object Storage (S3-compatible)
// bucket the warranty form writes to (patrik-warranty-form/src/lib/s3.ts), under
// uploads/media/. Uploads go through the server (not presigned browser PUTs), so the
// bucket's CORS rules never need to know the admin's origin. Credentials stay here.
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

let client: S3Client | null = null;

export function s3Configured(): boolean {
  return Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_BUCKET &&
      process.env.S3_PUBLIC_BASE &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY,
  );
}

function getClient(): S3Client {
  client ??= new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "fsn1",
    forcePathStyle: true, // Hetzner
    requestChecksumCalculation: "WHEN_REQUIRED", // Hetzner doesn't support CRC32 checksums
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });
  return client;
}

// Store `body` at `key` and return its public URL.
export async function putPublicObject(key: string, body: Uint8Array, contentType: string): Promise<string> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return `${process.env.S3_PUBLIC_BASE!.replace(/\/$/, "")}/${key}`;
}
