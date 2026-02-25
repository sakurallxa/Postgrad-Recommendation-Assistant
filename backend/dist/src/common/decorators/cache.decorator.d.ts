export declare const CACHE_KEY_METADATA = "cache_key";
export declare const CACHE_TTL_METADATA = "cache_ttl";
export declare const Cache: (key: string, ttl?: number) => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor;
export declare const ClearCache: (pattern: string) => import("@nestjs/common").CustomDecorator<string>;
