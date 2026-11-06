import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class StorageService {
  constructor({ privateFiles = false } = {}) {
    this.privateFiles = privateFiles;
    this.initialization = null;
  }

  async ensureS3Initialized() {
    if (!this.initialization) {
      this.initialization = this.initializeS3().catch(error => {
        this.initialization = null;
        throw error;
      });
    }
    await this.initialization;
  }

  async initializeS3() {
    const { S3Client, GetPublicAccessBlockCommand } = await import('@aws-sdk/client-s3');
    this.region = process.env.AWS_REGION;
    this.bucketName = this.privateFiles ? process.env.AWS_S3_PRIVATE_BUCKET_NAME : process.env.AWS_S3_BUCKET_NAME;
    if (!this.region || !this.bucketName) throw new Error(this.privateFiles ? 'Configure AWS_S3_PRIVATE_BUCKET_NAME for confidential attachments' : 'Configure AWS_REGION and AWS_S3_BUCKET_NAME');
    if (this.privateFiles && this.bucketName === process.env.AWS_S3_BUCKET_NAME) throw new Error('Confidential attachments require a separate private bucket');
    this.s3Client = new S3Client({ region: this.region });
    if (this.privateFiles) {
      const result = await this.s3Client.send(new GetPublicAccessBlockCommand({ Bucket: this.bucketName }));
      const flags = result.PublicAccessBlockConfiguration;
      if (!flags || !['BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets'].every(flag => flags[flag])) {
        throw new Error('Confidential storage requires all S3 Block Public Access settings');
      }
    }
  }

  getPublicUrl(storageKey) {
    if (this.privateFiles) return undefined;
    return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${encodeURIComponent(storageKey)}`;
  }

  async save(file) {
    await this.ensureS3Initialized();
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const fileId = randomUUID();
    const storageKey = `${fileId}${path.extname(file.originalname).toLowerCase()}`;
    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
      Body: file.buffer,
      ContentType: file.mimetype,
      ServerSideEncryption: 'AES256',
      Metadata: { fileId }
    }));
    return { storageKey, fileId, name: file.originalname, size: file.size, mime: file.mimetype, url: this.getPublicUrl(storageKey) };
  }

  async remove(storageKey) {
    await this.ensureS3Initialized();
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    await this.s3Client.send(new DeleteObjectCommand({ Bucket: this.bucketName, Key: storageKey }));
  }

  async get(storageKey) {
    await this.ensureS3Initialized();
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const result = await this.s3Client.send(new GetObjectCommand({ Bucket: this.bucketName, Key: storageKey }));
    return { body: result.Body, contentType: result.ContentType };
  }
}

const storageService = new StorageService();
export const privateStorageService = new StorageService({ privateFiles: true });
export default storageService;
