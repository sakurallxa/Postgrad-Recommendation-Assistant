"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const config_1 = require("@nestjs/config");
const openid_crypto_service_1 = require("./openid-crypto.service");
describe('OpenidCryptoService', () => {
    let service;
    const mockConfigService = {
        get: jest.fn((key) => {
            const config = {
                OPENID_HMAC_KEY: '0123456789abcdef0123456789abcdef',
                OPENID_ENCRYPTION_KEY: 'abcdef0123456789abcdef0123456789',
            };
            return config[key];
        }),
    };
    beforeEach(async () => {
        const module = await testing_1.Test.createTestingModule({
            providers: [
                openid_crypto_service_1.OpenidCryptoService,
                { provide: config_1.ConfigService, useValue: mockConfigService },
            ],
        }).compile();
        service = module.get(openid_crypto_service_1.OpenidCryptoService);
    });
    it('hash 应稳定且可重复', () => {
        const a = service.hash('openid_123');
        const b = service.hash('openid_123');
        const c = service.hash('openid_456');
        expect(a).toBe(b);
        expect(a).not.toBe(c);
    });
    it('encrypt/decrypt 应可逆', () => {
        const cipher = service.encrypt('openid_abc');
        const plain = service.decrypt(cipher);
        expect(plain).toBe('openid_abc');
    });
});
//# sourceMappingURL=openid-crypto.service.spec.js.map