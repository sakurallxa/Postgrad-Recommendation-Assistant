"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createConfiguredE2EApp = createConfiguredE2EApp;
const common_1 = require("@nestjs/common");
const http_exception_filter_1 = require("../src/common/filters/http-exception.filter");
async function createConfiguredE2EApp(moduleFixture) {
    const app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
    }));
    app.useGlobalFilters(new http_exception_filter_1.HttpExceptionFilter());
    app.setGlobalPrefix('api/v1');
    await app.init();
    return app;
}
//# sourceMappingURL=e2e-app.helper.js.map