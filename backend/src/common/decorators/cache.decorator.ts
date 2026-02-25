import { SetMetadata } from '@nestjs/common';

/**
 * 缓存元数据键
 */
export const CACHE_KEY_METADATA = 'cache_key';
export const CACHE_TTL_METADATA = 'cache_ttl';

/**
 * 缓存装饰器
 * 用于标记需要缓存的方法
 * 
 * @param key 缓存键，支持模板字符串如: 'universities:{page}:{limit}'
 * @param ttl 过期时间（秒）
 * 
 * @example
 * @Cache('universities:list', 3600)
 * async findAll() { ... }
 * 
 * @Cache('universities:{id}', 1800)
 * async findOne(@Param('id') id: string) { ... }
 */
export const Cache = (key: string, ttl: number = 3600) => {
  return (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) => {
    SetMetadata(CACHE_KEY_METADATA, key)(target, propertyKey, descriptor);
    SetMetadata(CACHE_TTL_METADATA, ttl)(target, propertyKey, descriptor);
    return descriptor;
  };
};

/**
 * 清除缓存装饰器
 * 用于标记需要清除缓存的方法
 * 
 * @param pattern 缓存键匹配模式
 * 
 * @example
 * @ClearCache('universities:*')
 * async update() { ... }
 */
export const ClearCache = (pattern: string) => {
  return SetMetadata('cache_clear_pattern', pattern);
};
