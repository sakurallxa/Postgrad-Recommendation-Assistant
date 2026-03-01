import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

@Injectable()
export class OpenidCryptoService {
  private readonly logger = new Logger(OpenidCryptoService.name);
  private readonly encryptionKey: Buffer;
  private readonly hmacKey: Buffer;

  constructor(private readonly configService: ConfigService) {
    this.encryptionKey = this.parseKey(
      this.configService.get<string>('OPENID_ENCRYPTION_KEY') || '',
      'OPENID_ENCRYPTION_KEY',
    );
    this.hmacKey = this.parseKey(
      this.configService.get<string>('OPENID_HMAC_KEY') || '',
      'OPENID_HMAC_KEY',
    );
  }

  hash(openid: string): string {
    return createHmac('sha256', this.hmacKey).update(openid).digest('hex');
  }

  encrypt(openid: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(openid, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
      iv.toString('base64'),
      tag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  decrypt(cipherText: string): string {
    const [ivB64, tagB64, dataB64] = cipherText.split(':');
    if (!ivB64 || !tagB64 || !dataB64) {
      throw new InternalServerErrorException('openid密文格式错误');
    }

    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const encrypted = Buffer.from(dataB64, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return plain.toString('utf8');
  }

  private parseKey(raw: string, keyName: string): Buffer {
    if (!raw) {
      throw new InternalServerErrorException(`${keyName} 未配置`);
    }

    let key: Buffer | null = null;
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      key = Buffer.from(raw, 'hex');
    } else if (/^[A-Za-z0-9+/=]+$/.test(raw)) {
      const decoded = Buffer.from(raw, 'base64');
      if (decoded.length === 32) {
        key = decoded;
      }
    }

    if (!key) {
      const utf8Key = Buffer.from(raw, 'utf8');
      if (utf8Key.length === 32) {
        key = utf8Key;
      }
    }

    if (!key || key.length !== 32) {
      this.logger.error(`${keyName} 长度非法，解析后长度=${key ? key.length : 0}`);
      throw new InternalServerErrorException(`${keyName} 必须是32字节密钥`);
    }

    return key;
  }
}
