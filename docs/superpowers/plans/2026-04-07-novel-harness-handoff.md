# 网络小说 Harness 当前进度与交接记录

日期：2026-04-07

## 1. 当前进度

项目已经完成以下里程碑：

1. 设计规格完成并提交  
   commit: `8483c87`

2. 实施计划完成并提交  
   commit: `e81aa26`

3. Monorepo 工程骨架完成  
   commit: `ee9c5ee`

4. 最小 runtime 闭环完成  
   commit: `798980b`

5. Live demo control room 完成  
   commit: `2320a78`

6. OpenAI 真实执行器支持完成  
   commit: `e6e64e9`

## 2. 当前已经可用的能力

目前项目已经不是静态脚手架，而是一个可运行 demo：

- 有本地 Web 工作台
- 有本地 orchestrator API
- 有 SQLite 运行记录
- 有文件资产落盘
- 有 fake executor 闭环
- 有 OpenAI executor 接入代码
- 有 fake / openai 自动切换逻辑

当前可访问入口：

- Control Room: `http://127.0.0.1:4173`
- Orchestrator health: `http://127.0.0.1:4000/health`

当前默认数据位置：

- Workspace: `D:\document\novel\research\apps\orchestrator\workspace`
- SQLite: `D:\document\novel\research\apps\orchestrator\data\novel-harness.db`

## 3. 当前真实状态

虽然真实执行器代码已经接好，但当前机器还没有配置 `OPENAI_API_KEY`，所以系统现在仍然运行在 `fake` 模式。

也就是说：

- 工作流是真的
- 状态流转是真的
- 资产落盘是真的
- UI 展示是真的
- 但题材、概念包、开篇、评分卡内容目前仍是 fake 数据

当前 health / state 接口会明确返回：

- `mode: fake`
- `reason: OPENAI_API_KEY not set; falling back to FakeExecutor.`

## 4. 待完成事项

优先级从高到低如下：

### P0

1. 在本机配置 `OPENAI_API_KEY`
2. 重启本地服务
3. 用真实执行器跑通一次 `idea_spread -> concept_pack -> opening_draft -> opening_review`
4. 确认真模型输出能被现有 schema 正常解析

### P1

1. 在 control-room 里增加“读取产物正文”能力  
   现在只展示 manifest 和路径，还没直接显示开篇正文、概念包正文、评分卡正文

2. 增加项目详情页  
   当前首页偏 dashboard，还不是完整项目工作台

3. 增加批次列表 / 最近项目列表  
   现在主要盯最近一次运行

### P2

1. 把 demo 单项目运行扩成真实批次多候选并行孵化
2. 给真实执行器补更细的错误分类与重试策略
3. 优化 prompt 与 rubric
4. 增加人工 gate 审批交互，而不是只展示结果

## 5. 待验收流程

下一阶段建议按下面顺序验收：

### 验收 A：Fake 模式烟测

目标：确认系统基本链路仍然稳定

检查项：

1. 页面可打开
2. 点击运行 demo 后能返回结果
3. 项目状态变成 `promoted`
4. 决策变成 `approve`
5. 可以看到节点流水、产物清单、gate 结果

### 验收 B：OpenAI 模式烟测

目标：确认真实执行器真正接管生成链

检查项：

1. 配置 `OPENAI_API_KEY`
2. 重启服务
3. `health` 返回 `mode: openai`
4. 页面显示当前 executor 为 OpenAI
5. 重新运行 demo 后，生成产物不再是 fake 固定文案

### 验收 C：真实产物验收

目标：确认当前 schema 和 prompt 足以支撑第一轮真实试产

检查项：

1. `idea_spread` 返回多组可用候选
2. `concept_pack` 有完整 premise、synopsis、worldRules、openingPromise
3. `opening_draft` 能稳定产出 3 章以上正文
4. `opening_review` 返回结构化评分卡
5. `promotion_decision` 能基于评分卡正常裁决

### 验收 D：工作台可用性验收

目标：确认你能把它当作实际工作台使用

检查项：

1. 页面里能直接读关键产物，不必手翻文件夹
2. 能清楚区分 fake / openai 模式
3. 能看到最近一次运行状态
4. 能定位失败节点和失败原因

## 6. 下次回来后的最短启动步骤

如果只是继续看 demo：

1. 启动 orchestrator
   `pnpm.cmd --filter @novel-harness/orchestrator dev`
2. 启动 control-room
   `pnpm.cmd --filter @novel-harness/control-room dev`
3. 打开 `http://127.0.0.1:4173`

如果要切到真实执行器：

1. 在 PowerShell 设置环境变量

```powershell
$env:OPENAI_API_KEY="你的 key"
$env:OPENAI_MODEL="gpt-5-mini"
```

2. 重启上面两个服务
3. 打开 `http://127.0.0.1:4173`
4. 确认页面显示 `mode: openai`
5. 再点击“运行 Demo 孵化”

## 7. 关键文件

核心入口：

- `apps/control-room/src/App.tsx`
- `apps/orchestrator/src/app.ts`

真实执行器：

- `packages/executors/src/openai.ts`
- `packages/executors/src/types.ts`

工作流与持久化：

- `packages/workflows/src/runtime.ts`
- `packages/assets/src/index.ts`
- `packages/db/src/client.ts`
- `packages/db/src/repository.ts`

设计与计划：

- `docs/superpowers/specs/2026-04-07-novel-harness-design.md`
- `docs/superpowers/plans/2026-04-07-novel-harness-implementation-plan.md`

## 8. 当前建议

下次继续时，不要先扩页面，也不要先做多本并行。  
最值钱的下一步只有一个：

- 先把 `OPENAI_API_KEY` 配上，完成真实执行器验收

只有这一步过了，后面的批次并行、项目详情、人工审批才有真实价值。
