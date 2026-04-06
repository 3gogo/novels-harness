# 网络小说多 Agent 生产 Harness 实施计划

日期：2026-04-07  
关联设计：[2026-04-07-novel-harness-design.md](../specs/2026-04-07-novel-harness-design.md)

## 1. 目标

本计划用于把已批准的设计稿转成一套可执行的工程落地路径。首版只追求一件事：尽快跑通“批量试产 -> 概念包 -> 开篇样稿 -> 评分裁决 -> 晋级/淘汰”的闭环。

首版完成定义：

- 可以创建批次并定义试产目标
- 可以自动跑通主流水线
- 可以把所有核心资产落到文件系统
- 可以在本地 Web 工作台查看状态、阅读产物、做晋级批准
- 可以接入至少两类执行器适配接口
- 可以记录每次运行的输入、输出、失败类型和恢复能力

## 2. 实施策略

总策略是“单仓、单语言、先内核后界面、先跑通再扩展”。

- 单仓：用一个 monorepo 承载前端、编排器、共享协议和执行器适配层
- 单语言：前后端统一 TypeScript，减少协议漂移
- 先内核后界面：先把资产协议、工作流和执行器接口做稳，再接 Web 工作台
- 先跑通再扩展：先覆盖试产主线，不碰长篇连载增强

## 3. 推荐技术栈

### 3.1 总体选择

推荐技术栈如下：

- 运行时：Node.js 22
- 语言：TypeScript
- 包管理：pnpm workspace
- 前端：React + Vite
- 后端 API：Fastify
- 本地数据库：SQLite
- ORM：Drizzle ORM
- 数据校验：Zod
- 作业与编排：自研轻量状态机内核
- 测试：Vitest
- UI 端到端：Playwright

### 3.2 选型理由

选择这套栈的原因：

- 本地单机优先，SQLite 足够，部署最轻
- TypeScript 能覆盖前后端协议、工作流合同和执行器输出结构
- Fastify 比全栈框架更适合清晰拆分 API 与编排层
- 自研轻量状态机比引入 Temporal、Airflow 这类系统更适合 MVP
- React + Vite 足以快速做本地工作台，不需要先上重型 SSR 框架

### 3.3 暂不引入的技术

首版不建议引入：

- Temporal、Airflow、Dagster 这类重工作流平台
- Postgres、Redis、消息队列
- Electron 桌面壳
- 微服务拆分

## 4. 推荐仓库结构

```text
workspace/
  apps/
    control-room/          # 本地 Web 工作台
    orchestrator/          # 编排服务与本地 API
  packages/
    schemas/               # zod schemas, shared types
    db/                    # drizzle schema, migrations, repositories
    assets/                # 文件资产层
    workflows/             # workflow nodes, state machine, gate logic
    executors/             # executor adapters, role bindings
    prompts/               # role prompts, rubrics, templates
    evaluation/            # scoring, ranking, promote/kill logic
    testkit/               # fixtures, golden samples, fake executors
  docs/
    superpowers/
      specs/
      plans/
```

拆分原则：

- `apps/` 放可运行进程
- `packages/` 放稳定能力层
- 编排、资产、执行器、评分分仓隔离，避免未来糊成一个大服务

## 5. 核心数据模型

第一批必须稳定下来的模型：

### 5.1 Batch

用于描述一次批量试产。

关键字段：

- `batch_id`
- `name`
- `target_lane`
- `audience`
- `constraints`
- `status`
- `current_stage`
- `project_ids`

### 5.2 Project

用于描述单个小说项目。

关键字段：

- `project_id`
- `slug`
- `title`
- `status`
- `stage`
- `batch_id`
- `bible_version`
- `latest_score`
- `decision`

### 5.3 WorkflowRun / NodeRun

用于追踪主工作流与节点执行。

关键字段：

- `run_id`
- `project_id`
- `node_name`
- `role_profile`
- `executor_id`
- `status`
- `failure_type`
- `retry_count`
- `input_refs`
- `output_refs`

### 5.4 ArtifactManifest

用于描述文件资产和版本关系。

关键字段：

- `artifact_id`
- `project_id`
- `kind`
- `path`
- `version`
- `producer`
- `source_run_id`

### 5.5 ReviewScorecard

用于承载评审组输出。

关键字段：

- `hook_score`
- `retention_score`
- `novelty_score`
- `prose_score`
- `serial_potential_score`
- `risk_flags`
- `decision_suggestion`

### 5.6 GateTask

用于人工审批节点。

关键字段：

- `gate_id`
- `project_id`
- `gate_type`
- `status`
- `payload_refs`
- `approved_by`
- `decision`

## 6. 关键协议先行

在真正写业务逻辑前，先冻结 4 组协议。

### 6.1 资产协议

定义以下内容：

- 每类资产的目录位置
- 文件命名规则
- 元数据 manifest 格式
- 版本递增规则
- 资产间引用方式

### 6.2 节点合同

每个 workflow node 必须声明：

- 输入资产类型
- 输出资产类型
- 允许使用的角色
- 允许失败类型
- 自动重跑策略
- 验收器

### 6.3 执行器合同

每个 executor adapter 必须支持：

- 接收标准化任务
- 返回标准化输出
- 返回 trace 与 usage
- 返回结构化错误

### 6.4 评分合同

所有评审输出必须结构化，不能只给一段自然语言。

至少要有：

- 多维评分
- 风险标签
- 继续/返工/淘汰建议
- 文字说明

## 7. 实施里程碑

### Milestone 0：仓库脚手架

目标：

- 建立 monorepo
- 初始化 TypeScript、pnpm workspace、lint、test
- 建立 apps 与 packages 基础目录

交付物：

- 可安装、可构建、可测试的空仓骨架
- 基础 CI 脚本

退出标准：

- `pnpm install`
- `pnpm test`
- `pnpm build`
  都能在空骨架上通过

### Milestone 1：资产层与共享协议

目标：

- 完成 `schemas`、`assets`、`db` 的第一版
- 固定目录结构和 manifest
- 定义 Batch、Project、NodeRun、ArtifactManifest schema

交付物：

- 资产读写 API
- 本地路径解析与版本生成
- SQLite 基础表与 migration

退出标准：

- 能创建批次与项目
- 能把假数据资产正确落盘并登记到 DB

### Milestone 2：编排内核

目标：

- 实现状态机和节点执行器
- 实现 run、resume、retry、archive
- 实现人工闸门挂起与恢复

交付物：

- 工作流引擎最小可用版
- 节点注册表
- 失败分类与恢复策略

退出标准：

- 可以用 fake executor 跑通完整主流水线
- 可以在 `retryable` 和 `review_required` 两类失败间正确流转

### Milestone 3：执行器适配与角色模板

目标：

- 实现至少两类 executor adapter
- 实现 role profile 和 prompt 模板装配
- 实现 trace、usage、raw output 归档

交付物：

- `executors` 包
- `prompts` 包
- `fake executor`、`real executor A`、`real executor B`

退出标准：

- 不改工作流代码即可切换 executor
- 同一角色可绑定不同执行器

### Milestone 4：试产主流水线

目标：

- 实现 `batch_brief`
- 实现 `idea_spread`
- 实现 `concept_pack`
- 实现 `opening_draft`
- 实现 `opening_review`
- 实现 `promotion_decision`

交付物：

- 主流水线节点实现
- 评分器与排序器
- promote / retry / kill 决策逻辑

退出标准：

- 用真实执行器可以从批次创建跑到项目裁决
- 所有产物均可追溯到上游输入和运行记录

### Milestone 5：本地 Web 工作台

目标：

- 做出最小可用 Web 工作台
- 打通批次页、项目页、评审页
- 支持 Gate 审批

交付物：

- 批次控制台
- 项目看板
- 评审台
- 资产阅读器

退出标准：

- 你不需要进文件夹，也能完成一次试产批次的查看和晋级批准

### Milestone 6：硬化与发布前整理

目标：

- 加强日志、错误提示、空态处理
- 补充测试基线
- 提高可恢复性和可维护性

交付物：

- 更完整的失败报告
- 示例数据集
- Golden sample 回归测试

退出标准：

- 连续跑多批次时状态不串
- 重跑、恢复、归档行为稳定

## 8. 首版节点实现顺序

建议严格按下面顺序写，避免并行开发时接口反复改：

1. `schemas`
2. `db`
3. `assets`
4. `workflows core`
5. `executors base`
6. `fake executor`
7. `idea_spread`
8. `concept_pack`
9. `opening_draft`
10. `opening_review`
11. `promotion_decision`
12. `control-room UI`

原因：

- 先把协议和资产层定住，后面节点实现不会反复返工
- 先用 fake executor 验证状态机，再接真实模型
- UI 放后面，避免前端先跑导致底层协议频繁变化

## 9. 测试计划

### 9.1 单元测试

覆盖：

- schema 校验
- 路径生成
- manifest 版本递增
- 评分聚合
- promote / retry / kill 规则

### 9.2 集成测试

覆盖：

- 从批次创建到项目入库
- fake executor 跑通全流程
- 节点失败后的重试与恢复
- 人工 Gate 的挂起与继续

### 9.3 端到端测试

覆盖：

- 在 Web 工作台发起批次
- 查看项目状态
- 阅读评分卡
- 完成晋级批准

### 9.4 Golden Sample

为小说场景保留一组固定样本：

- 一组应该被晋级的项目
- 一组应该被返工的项目
- 一组应该被淘汰的项目

这样后续改评分逻辑时可以快速发现回归。

## 10. 多 Agent 协同落点

为了适合后续多 agent 协同，工程上要明确这些边界：

- 每个 workflow node 都有稳定输入输出，方便并行实现
- `packages/` 之间职责分离，避免多人改同一块文件
- role profile、prompt、rubric 独立存放，方便让 agent 单独维护
- fake executor 和 fixtures 先行，方便不同 agent 并行开发而不依赖真实模型

未来如果你显式要求多 agent 并行，可按下列边界切分：

- Agent 1：`schemas + db`
- Agent 2：`assets + manifest`
- Agent 3：`workflows core`
- Agent 4：`executors + prompts`
- Agent 5：`control-room UI`

## 11. 风险与缓解

### 11.1 协议漂移

风险：

- 前端、编排器、执行器各自理解不同

缓解：

- 先冻结 schema 与 node contract
- 所有输入输出统一走 `schemas`

### 11.2 评分不可复盘

风险：

- 评审只给自然语言，后面无法稳定比较

缓解：

- 强制 scorecard 结构化
- 文字说明只作补充，不作唯一决策依据

### 11.3 过早引入真实模型导致调试困难

风险：

- 状态机问题和模型输出问题混在一起

缓解：

- 先用 fake executor 打通主线
- 真实执行器后接

### 11.4 UI 反向绑架底层设计

风险：

- 为了赶界面，把底层协议做乱

缓解：

- UI 开发放到主流水线稳定之后
- 优先做资产阅读和审批，不做重编辑

## 12. 推荐的第一轮实际施工任务

如果现在开始编码，第一轮只做以下内容：

1. 初始化 monorepo 和 TypeScript 基础设施
2. 定义 `Batch`、`Project`、`NodeRun`、`ArtifactManifest` schema
3. 做文件资产层最小实现
4. 做 workflow core 最小实现
5. 做 fake executor
6. 用 fake executor 跑通 `idea -> concept_pack -> review -> decision`

这轮完成后，再接真实执行器和 Web 工作台。这样最稳。

## 13. 结论

实施顺序必须保持克制：先把“协议、资产、状态机、假执行器”做对，再接“真实执行器、评分器、UI”。  
只要首版把试产主线闭环打通，这个 harness 就已经具备长期扩展成完整小说生产团队的基础。
