import { PrismaClient } from '@prisma/client';
import { createCipheriv, createHmac, randomBytes } from 'crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

function parseKey(raw: string | undefined, keyName: string): Buffer {
  if (!raw) {
    throw new Error(`${keyName} 未配置`);
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
    throw new Error(`${keyName} 必须是32字节密钥`);
  }
  return key;
}

function hashOpenid(openid: string, hmacKey: Buffer): string {
  return createHmac('sha256', hmacKey).update(openid).digest('hex');
}

function encryptOpenid(openid: string, encryptionKey: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(openid, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

async function main() {
  const encryptionKey = parseKey(process.env.OPENID_ENCRYPTION_KEY, 'OPENID_ENCRYPTION_KEY');
  const hmacKey = parseKey(process.env.OPENID_HMAC_KEY, 'OPENID_HMAC_KEY');

  const users = await prisma.user.findMany({
    where: {
      OR: [{ openid: { not: null } }, { openidHash: null }, { openidCipher: null }],
    },
    select: {
      id: true,
      openid: true,
      openidHash: true,
      openidCipher: true,
    },
  });

  let migrated = 0;
  let skipped = 0;

  for (const user of users) {
    const sourceOpenid = user.openid;
    if (!sourceOpenid && user.openidHash && user.openidCipher) {
      skipped += 1;
      continue;
    }

    if (!sourceOpenid) {
      skipped += 1;
      continue;
    }

    const openidHash = hashOpenid(sourceOpenid, hmacKey);
    const openidCipher = encryptOpenid(sourceOpenid, encryptionKey);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        openidHash,
        openidCipher,
        openid: null,
      },
    });

    migrated += 1;
  }

  // 清理遗留明文openid（防止上面因跳过导致残留）
  const cleanup = await prisma.user.updateMany({
    where: { openid: { not: null } },
    data: { openid: null },
  });

  console.log(`openid迁移完成: migrated=${migrated}, skipped=${skipped}, cleanup=${cleanup.count}`);
}

main()
  .catch((e) => {
    console.error('openid迁移失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
