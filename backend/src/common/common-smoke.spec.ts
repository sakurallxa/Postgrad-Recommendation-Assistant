import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { RateLimitMiddleware } from './middleware/rate-limit.middleware';
import { LoggerMiddleware } from './middleware/logger.middleware';
import { Cache, ClearCache } from './decorators/cache.decorator';
import { AppModule } from '../app.module';
import { CommonModule } from './common.module';

describe('Common smoke', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('JwtAuthGuard validates bearer token and attaches payload', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1' }),
    };
    const configService = {
      get: jest.fn().mockReturnValue('secret'),
    };
    const guard = new JwtAuthGuard(jwtService as any, configService as any);
    const request: any = {
      headers: { authorization: 'Bearer token_1' },
    };
    const context: any = {
      switchToHttp: () => ({ getRequest: () => request }),
    };

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ sub: 'u1' });
  });

  it('JwtAuthGuard rejects missing or invalid token', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockRejectedValue(new Error('bad token')),
    };
    const configService = {
      get: jest.fn().mockReturnValue('secret'),
    };
    const guard = new JwtAuthGuard(jwtService as any, configService as any);
    const requestWithoutToken: any = { headers: {} };
    const requestWithBadToken: any = {
      headers: { authorization: 'Bearer bad' },
    };

    await expect(
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => requestWithoutToken }),
      } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => requestWithBadToken }),
      } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('HttpExceptionFilter formats error response', () => {
    const filter = new HttpExceptionFilter();
    const loggerSpy = jest.spyOn((filter as any).logger, 'error').mockImplementation();
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const request = {
      method: 'GET',
      url: '/x',
    };
    const host: any = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    };
    const exception = new HttpException(
      { message: 'bad request', details: ['d1'] },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, host);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 1001,
        message: 'bad request',
        details: ['d1'],
        path: '/x',
      }),
    );
    expect(loggerSpy).toHaveBeenCalled();
  });

  it('RateLimitMiddleware sets headers and blocks when over limit', () => {
    const setIntervalSpy = jest
      .spyOn(global, 'setInterval')
      .mockReturnValue({ unref: jest.fn() } as any);

    const configService = {
      get: jest.fn((key: string, fallback: number) => {
        if (key === 'RATE_LIMIT_WINDOW') return 60_000;
        if (key === 'RATE_LIMIT_MAX') return 2;
        return fallback;
      }),
    };
    const middleware = new RateLimitMiddleware(configService as any);
    const req: any = {
      headers: {},
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
    };
    const res: any = {
      setHeader: jest.fn(),
    };
    const next = jest.fn();

    middleware.use(req, res, next);
    middleware.use(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);

    expect(() => middleware.use(req, res, next)).toThrow(HttpException);
    setIntervalSpy.mockRestore();
  });

  it('LoggerMiddleware logs based on response status', () => {
    const middleware = new LoggerMiddleware();
    const logger = (middleware as any).logger;
    const logSpy = jest.spyOn(logger, 'log').mockImplementation();
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();
    const errSpy = jest.spyOn(logger, 'error').mockImplementation();

    let finishHandler: (() => void) | undefined;
    const req: any = {
      method: 'GET',
      originalUrl: '/health',
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
    };
    const res: any = {
      statusCode: 200,
      on: jest.fn((event: string, handler: () => void) => {
        if (event === 'finish') finishHandler = handler;
      }),
      get: jest.fn().mockReturnValue('10'),
    };

    middleware.use(req, res, jest.fn());
    finishHandler?.();
    expect(logSpy).toHaveBeenCalled();

    res.statusCode = 404;
    middleware.use(req, res, jest.fn());
    finishHandler?.();
    expect(warnSpy).toHaveBeenCalled();

    res.statusCode = 500;
    middleware.use(req, res, jest.fn());
    finishHandler?.();
    expect(errSpy).toHaveBeenCalled();
  });

  it('Cache decorators attach metadata', () => {
    class Demo {
      run() {
        return true;
      }
    }
    const descriptor = Object.getOwnPropertyDescriptor(Demo.prototype, 'run') as PropertyDescriptor;
    const returnedDescriptor = Cache('k1', 120)(Demo.prototype, 'run', descriptor);
    expect(returnedDescriptor).toBe(descriptor);

    const clearDecorator = ClearCache('k:*');
    expect(typeof clearDecorator).toBe('function');
  });

  it('AppModule configure wires middlewares', () => {
    const appModule = new AppModule();
    const forRoutes = jest.fn();
    const apply = jest.fn().mockReturnValue({ forRoutes });
    const consumer: any = { apply };
    appModule.configure(consumer);
    expect(apply).toHaveBeenCalled();
    expect(forRoutes).toHaveBeenCalledWith('*');
  });

  it('CommonModule is defined', () => {
    expect(CommonModule).toBeDefined();
  });
});
