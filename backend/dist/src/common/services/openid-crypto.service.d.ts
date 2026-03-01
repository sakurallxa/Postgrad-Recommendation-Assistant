import { ConfigService } from '@nestjs/config';
export declare class OpenidCryptoService {
    private readonly configService;
    private readonly logger;
    private readonly encryptionKey;
    private readonly hmacKey;
    constructor(configService: ConfigService);
    hash(openid: string): string;
    encrypt(openid: string): string;
    decrypt(cipherText: string): string;
    private parseKey;
}
