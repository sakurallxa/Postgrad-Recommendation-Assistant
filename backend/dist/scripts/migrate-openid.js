"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
const prisma = new client_1.PrismaClient();
function parseKey(raw, keyName) {
    if (!raw) {
        throw new Error(`${keyName} 未配置`);
    }
    let key = null;
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
        key = Buffer.from(raw, 'hex');
    }
    else if (/^[A-Za-z0-9+/=]+$/.test(raw)) {
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
function hashOpenid(openid, hmacKey) {
    return (0, crypto_1.createHmac)('sha256', hmacKey).update(openid).digest('hex');
}
function encryptOpenid(openid, encryptionKey) {
    const iv = (0, crypto_1.randomBytes)(12);
    const cipher = (0, crypto_1.createCipheriv)('aes-256-gcm', encryptionKey, iv);
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
//# sourceMappingURL=migrate-openid.js.map