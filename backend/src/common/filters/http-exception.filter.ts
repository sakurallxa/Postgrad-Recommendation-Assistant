import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * 全局HTTP异常过滤器
 * 统一处理HTTP异常，返回标准格式的错误响应
 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    // 构建错误响应
    const errorResponse = {
      code: this.getErrorCode(status),
      message: this.getErrorMessage(exceptionResponse),
      details: this.getErrorDetails(exceptionResponse),
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // 记录错误日志
    this.logger.error(
      `${request.method} ${request.url} ${status} - ${errorResponse.message}`,
      exception.stack,
    );

    response.status(status).json(errorResponse);
  }

  /**
   * 根据HTTP状态码获取错误码
   */
  private getErrorCode(status: number): number {
    const errorCodeMap: Record<number, number> = {
      [HttpStatus.BAD_REQUEST]: 1001,
      [HttpStatus.UNAUTHORIZED]: 1003,
      [HttpStatus.FORBIDDEN]: 1004,
      [HttpStatus.NOT_FOUND]: 2001,
      [HttpStatus.INTERNAL_SERVER_ERROR]: 5000,
    };
    return errorCodeMap[status] || 5000;
  }

  /**
   * 获取错误消息
   */
  private getErrorMessage(exceptionResponse: string | object): string {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }
    return (exceptionResponse as any).message || '服务器内部错误';
  }

  /**
   * 获取错误详情
   */
  private getErrorDetails(exceptionResponse: string | object): any {
    if (typeof exceptionResponse === 'object') {
      return (exceptionResponse as any).details || (exceptionResponse as any).message;
    }
    return undefined;
  }
}
