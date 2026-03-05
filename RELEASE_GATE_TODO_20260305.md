# 上线门禁待定清单（2026-03-05）

## 1. 当前结论
- 当前发布结论：`No-Go`
- 结论时间：`2026-03-05`
- 原因：存在多项 P0/P1 阻断项未闭环（环境变量、健康检查、Lint、参数校验、Redis、压测、覆盖率、子项目测试基线）。

---

## 2. 阻断项总表（按优先级）

| ID | 优先级 | 状态 | 阻断项 | 验收标准（通过即勾选） | 建议验证命令 |
|---|---|---|---|---|---|
| GATE-01 | P0 | 未完成 | 生产关键环境变量未齐全 | `.env`/部署环境中以下键全部就绪且为生产值：`CRAWLER_INGEST_KEY`、`WX_PROGRESS_CHANGE_TEMPLATE_ID`、`WECHAT_ACTION_TOKEN_ENABLED=true`、`AUTO_MATCH_ENABLED=true`、`AUTO_PROGRESS_HIGH_CONF_ENABLED=false`、`DEEPSEEK_API_KEY`、`DEEPSEEK_FALLBACK_ENABLED=true` | `npm --prefix backend run start` 后观察启动日志；手工核对变量 |
| GATE-02 | P0 | 未完成 | 健康检查接口与脚本不一致（`/health` 返回 404） | `GET /health` 返回 `200`，`backend/scripts/health-check.sh` 全部通过并退出码 `0` | `curl -i http://127.0.0.1:3000/health`；`cd backend && bash scripts/health-check.sh` |
| GATE-03 | P0 | 未完成 | Lint 门禁不可执行（缺 ESLint 配置） | `npm --prefix backend run lint` 退出码 `0` 且无严重规范问题 | `npm --prefix backend run lint` |
| GATE-04 | P0 | 未完成 | `universities?page=1&limit=5` 参数校验异常（400） | `GET /api/v1/universities?page=1&limit=5` 返回 `200` 且分页正确 | `curl "http://127.0.0.1:3000/api/v1/universities?page=1&limit=5"` |
| GATE-05 | P0 | 未完成 | Redis 运行依赖未就绪（启动持续连接错误） | 服务启动后无持续 Redis 连接错误；`ping` 正常 | `redis-cli -h <host> -p <port> ping`；检查后端日志 |
| GATE-06 | P1 | 未完成 | 性能门禁失败（压测大量 429/非2xx） | 按测试计划达到门禁：并发成功率 `>99%`；P95 `<500ms`（需按实际限流策略配置） | `ab`/`wrk` 压测并留存报告 |
| GATE-07 | P1 | 未完成 | 后端覆盖率不足（当前约 30%） | 单测覆盖率达到测试计划门槛（当前文档目标 `>80%`）或有正式豁免记录 | `npm --prefix backend run test:cov -- --runInBand` |
| GATE-08 | P1 | 未完成 | Miniprogram 无可执行测试基线 | `npm --prefix miniprogram test` 不再是占位脚本，至少具备 smoke 回归 | `npm --prefix miniprogram test` |
| GATE-09 | P1 | 未完成 | Crawler 无可执行测试基线 | `crawler` 至少有可执行 pytest smoke 用例并通过 | `cd crawler && python3 -m pytest -q` |

---

## 3. 已完成项（本轮已确认）

| ID | 状态 | 说明 |
|---|---|---|
| DONE-01 | 已完成 | `db:deploy` 通过（无待迁移） |
| DONE-02 | 已完成 | `backend build` 通过 |
| DONE-03 | 已完成 | `backend test` 通过（98/98） |
| DONE-04 | 已完成 | `backend e2e` 通过（41/41） |
| DONE-05 | 已完成 | Reminder `content` P1 修复已落地，相关回归用例已补齐 |
| DONE-06 | 已完成 | `progress` HTTP 层 e2e（supertest）已补，覆盖 DTO/Pipe/Guard 主链路 |

---

## 4. 建议执行顺序（上线前最短路径）

1. 先清 `GATE-01`（环境变量）和 `GATE-05`（Redis）  
2. 再清 `GATE-02`（健康检查）和 `GATE-04`（universities 分页参数）  
3. 然后清 `GATE-03`（Lint）  
4. 最后处理 `GATE-06/07/08/09`（性能、覆盖率、子项目测试基线）  
5. 全量复跑一次上线核验并重新给出 Go/No-Go

---

## 5. 每次改动后的复核命令（统一）

```bash
# 1) 数据库与构建
npm --prefix backend run db:deploy
npm --prefix backend run build

# 2) 质量与测试
npm --prefix backend run lint
npm --prefix backend run test -- --runInBand
npm --prefix backend run test:e2e -- --runInBand
npm --prefix backend run test:cov -- --runInBand

# 3) 运行时检查
curl -i http://127.0.0.1:3000/health
curl -i "http://127.0.0.1:3000/api/v1/universities?page=1&limit=5"
cd backend && bash scripts/health-check.sh
```

---

## 6. 跟踪记录（你改完一项后直接追加）

```text
[YYYY-MM-DD HH:mm] GATE-XX
- 改动文件:
- 改动摘要:
- 验证命令:
- 验证结果:
- 结论: 已完成 / 未完成
```

