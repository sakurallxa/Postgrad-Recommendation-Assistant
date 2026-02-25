import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * 获取当前登录用户的装饰器
 * 使用方式: @CurrentUser() user: User
 */
export const CurrentUser = createParamDecorator(
  (data: keyof any | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    
    return data ? user?.[data] : user;
  },
);
