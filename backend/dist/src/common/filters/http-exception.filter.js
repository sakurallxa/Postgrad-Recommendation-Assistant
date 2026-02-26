"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var HttpExceptionFilter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
let HttpExceptionFilter = HttpExceptionFilter_1 = class HttpExceptionFilter {
    constructor() {
        this.logger = new common_1.Logger(HttpExceptionFilter_1.name);
    }
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        const status = exception.getStatus();
        const exceptionResponse = exception.getResponse();
        const errorResponse = {
            code: this.getErrorCode(status),
            message: this.getErrorMessage(exceptionResponse),
            details: this.getErrorDetails(exceptionResponse),
            timestamp: new Date().toISOString(),
            path: request.url,
        };
        this.logger.error(`${request.method} ${request.url} ${status} - ${errorResponse.message}`, exception.stack);
        response.status(status).json(errorResponse);
    }
    getErrorCode(status) {
        const errorCodeMap = {
            [common_1.HttpStatus.BAD_REQUEST]: 1001,
            [common_1.HttpStatus.UNAUTHORIZED]: 1003,
            [common_1.HttpStatus.FORBIDDEN]: 1004,
            [common_1.HttpStatus.NOT_FOUND]: 2001,
            [common_1.HttpStatus.INTERNAL_SERVER_ERROR]: 5000,
        };
        return errorCodeMap[status] || 5000;
    }
    getErrorMessage(exceptionResponse) {
        if (typeof exceptionResponse === 'string') {
            return exceptionResponse;
        }
        return exceptionResponse.message || '服务器内部错误';
    }
    getErrorDetails(exceptionResponse) {
        if (typeof exceptionResponse === 'object') {
            return exceptionResponse.details || exceptionResponse.message;
        }
        return undefined;
    }
};
exports.HttpExceptionFilter = HttpExceptionFilter;
exports.HttpExceptionFilter = HttpExceptionFilter = HttpExceptionFilter_1 = __decorate([
    (0, common_1.Catch)(common_1.HttpException)
], HttpExceptionFilter);
//# sourceMappingURL=http-exception.filter.js.map