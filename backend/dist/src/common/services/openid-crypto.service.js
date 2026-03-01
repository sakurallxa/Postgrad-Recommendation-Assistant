"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var OpenidCryptoService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenidCryptoService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto_1 = require("crypto");
let OpenidCryptoService = OpenidCryptoService_1 = class OpenidCryptoService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(OpenidCryptoService_1.name);
        this.encryptionKey = this.parseKey(this.configService.get('OPENID_ENCRYPTION_KEY') || '', 'OPENID_ENCRYPTION_KEY');
        this.hmacKey = this.parseKey(this.configService.get('OPENID_HMAC_KEY') || '', 'OPENID_HMAC_KEY');
    }
    hash(openid) {
        return (0, crypto_1.createHmac)('sha256', this.hmacKey).update(openid).digest('hex');
    }
    encrypt(openid) {
        const iv = (0, crypto_1.randomBytes)(12);
        const cipher = (0, crypto_1.createCipheriv)('aes-256-gcm', this.encryptionKey, iv);
        const encrypted = Buffer.concat([cipher.update(openid, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return [
            iv.toString('base64'),
            tag.toString('base64'),
            encrypted.toString('base64'),
        ].join(':');
    }
    decrypt(cipherText) {
        const [ivB64, tagB64, dataB64] = cipherText.split(':');
        if (!ivB64 || !tagB64 || !dataB64) {
            throw new common_1.InternalServerErrorException('openid密文格式错误');
        }
        const iv = Buffer.from(ivB64, 'base64');
        const tag = Buffer.from(tagB64, 'base64');
        const encrypted = Buffer.from(dataB64, 'base64');
        const decipher = (0, crypto_1.createDecipheriv)('aes-256-gcm', this.encryptionKey, iv);
        decipher.setAuthTag(tag);
        const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return plain.toString('utf8');
    }
    parseKey(raw, keyName) {
        if (!raw) {
            throw new common_1.InternalServerErrorException(`${keyName} 未配置`);
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
            this.logger.error(`${keyName} 长度非法，解析后长度=${key ? key.length : 0}`);
            throw new common_1.InternalServerErrorException(`${keyName} 必须是32字节密钥`);
        }
        return key;
    }
};
exports.OpenidCryptoService = OpenidCryptoService;
exports.OpenidCryptoService = OpenidCryptoService = OpenidCryptoService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], OpenidCryptoService);
//# sourceMappingURL=openid-crypto.service.js.map