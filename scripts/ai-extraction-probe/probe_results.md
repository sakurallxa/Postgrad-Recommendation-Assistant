# Phase 0 Probe — DeepSeek deadline extraction

- total samples: 10
- API success: 10  /  errors: 0
- deadline extracted: 2  /  said null: 8
- grounded (evidence found in source): 2  /  hallucinated: 0
- tokens: in=16096 out=1248  ≈ $0.0057

## Per-sample

| # | univ | type(orig→llm) | deadline | grounded | conf | evidence |
|---|---|---|---|---|---|---|
| 1 | fudan | pre_recommendation→pre_recommendation | ∅ | None | 0.95 |  |
| 2 | sjtu | summer_camp→summer_camp | 2025-07-04 | True | 0.95 | 请于2025年6月13日-2025年7月4日期间登录上海交通大学研究生招生网进行网上报名 |
| 3 | ustc | pre_recommendation→pre_recommendation | 2025-09-10T18:00 | True | 0.95 | 报名时间：9月5日09:00至9月10日18:00，逾期将不予受理。 |
| 4 | nju | pre_recommendation→pre_recommendation | ∅ | None | 0.95 |  |
| 5 | zju | summer_camp→summer_camp | ∅ | None | 0.0 |  |
| 6 | buaa | summer_camp→pre_recommendation | ∅ | None | 0.9 |  |
| 7 | bit | summer_camp→summer_camp | ∅ | None | 0.9 |  |
| 8 | ruc | pre_recommendation→pre_recommendation | ∅ | None | 0.95 |  |
| 9 | bnu | pre_recommendation→pre_recommendation | ∅ | None | 0.9 |  |
| 10 | cau | pre_recommendation→pre_recommendation | ∅ | None | 0.9 |  |
