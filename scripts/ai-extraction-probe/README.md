# AI Extraction Probe — Phase 0

判断"用 DeepSeek 全量做公告字段抽取"是否值得切换的 10 条样本验证脚本。

## 它在做什么

从最新 QA 报告里挑出 10 条 **deadline 抽不到的** 真实公告（覆盖 fudan / sjtu / ustc / nju / zju / buaa / bit / ruc / bnu / cau，混合夏令营和预推免、不同正文长度），让 DeepSeek 抽取：

- `announcementType`（夏令营 / 预推免）
- `deadline` / `startDate` / `endDate`
- 每个字段必须同时给出 `evidence_quote`（grounding 校验：必须在原文出现，禁止编造）
- `confidence` + `reasoning`

跑完输出三份产物：

- `probe_results.jsonl` — 增量追加，每跑一条写一行，可断点续跑
- `probe_results.json` — 最终聚合 + summary
- `probe_results.md` — 对比表（方便贴回对话）

## 运行

```bash
cd <repo>/scripts/ai-extraction-probe
python3 probe_deadline_llm.py --fresh
```

脚本会自动从 `<repo>/backend/.env` 读取 `DEEPSEEK_API_KEY`。

只跑特定几条：

```bash
python3 probe_deadline_llm.py --only 1 2 5 --fresh
```

预计耗时：10 条 × 3-5 秒 ≈ 30-50 秒。预计花费 < $0.04。

## 评估什么指标

- **召回率** (`deadlineExtracted / total`)：LLM 能补齐多少条 missing-deadline？目标 ≥ 60%
- **Grounding 通过率** (`grounded / deadlineExtracted`)：抽出来的日期是否真在原文？目标 ≥ 95%
- **类型识别** (`originalAnnouncementType → llmAnnouncementType`)：预推免章程是否被正确分类（应该返回 null deadline 而不是硬填）
- **Token / 成本**：实际 input/output 用量，外推全量成本

## 决策点

跑完看 `probe_results.md`：

- **召回 ≥ 60% 且 grounding ≥ 95%** → 进 Phase 1：把后端 fallback 默认开启
- **召回低但 grounding 高** → prompt 还有调优空间，先迭代 prompt 再看
- **grounding 低（< 90%）** → LLM 在编造日期，停下，先把 grounding 校验做严

## 后续

确认走 LLM-first 路线后：

1. 把 grounding 校验逻辑搬到 `backend/src/modules/crawler/crawler.service.ts`
2. 改 `evaluateDeepSeekFallback` 触发条件：`!item.deadline && summer_camp` 强制走 LLM
3. 后端 prompt 同步加 `evidence_quote` 字段要求
4. 跑全量 129 条对比，灰度上线
