import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OpenidCryptoService } from './openid-crypto.service';

describe('OpenidCryptoService', () => {
  let service: OpenidCryptoService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        OPENID_HMAC_KEY: '0123456789abcdef0123456789abcdef',
        OPENID_ENCRYPTION_KEY: 'abcdef0123456789abcdef0123456789',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenidCryptoService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<OpenidCryptoService>(OpenidCryptoService);
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

