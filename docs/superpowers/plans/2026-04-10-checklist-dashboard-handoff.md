# Novel Harness Checklist 工作台重构交接记录

日期：2026-04-10

## 1. 本轮目标

这轮工作的目标不是直接重写 runtime，而是先解决一个更基础的问题：

- 当前工作流反馈不直观
- 产物虽然生成了，但用户感知不到
- 页面更像日志面板，不像实际工作台

所以本轮先做 Phase 1：

1. 把 control-room 从“节点流水 + 产物列表”重组为 checklist 工作台
2. 把关键产物挂到对应阶段里直接可读
3. 把 checkpoint、当前阶段、Attention Queue 显式化
4. 为后续 `resume / rollback / skip / parallel` 预留清晰入口

## 2. 本轮已完成

### 2.1 UI 信息架构重构完成

`apps/control-room/src/App.tsx`

已完成以下改造：

- 首页主视图改成 `Checklist Control Room`
- 增加 `Run Checklist` 总进度区
- 增加 `Attention Queue`
- 把流程展示从“按日志摊平”改成“按阶段聚合”
- 每个阶段展示：
  - 状态
  - 角色集合
  - 最近一次尝试
  - 关键产物
  - 下一动作
  - checkpoint 是否已形成
- 多角色阶段打上 `parallel-ready` 标记，明确后续可以接并行执行

### 2.2 关键产物内联预览完成

以前 control-room 只能看到 manifest 和路径，必须自己进文件夹翻。

现在改成：

- 每个阶段直接显示主产物
- 可以展开查看产物正文预览
- `trace_log` 不再和主产物同权竞争注意力

### 2.3 后端补了产物正文读取接口

`apps/orchestrator/src/app.ts`
`packages/db/src/repository.ts`

新增：

- `GET /api/artifacts/:artifactId/content`
- repository 层 `getArtifactManifest(artifactId)`

这样前端不需要只看路径，可以按 `artifactId` 直接读正文。

### 2.4 样式层完成 checklist 化

`apps/control-room/src/styles.css`

已完成：

- checklist dashboard 布局
- progress summary 卡片
- stage card 样式
- artifact preview 样式
- sidebar / attention 区样式

## 3. 当前真实进度判断

本轮属于：

- 产品交互层显著推进
- 执行控制层尚未开始真正重构

也就是说，现在已经做到：

- “流程看得见了”
- “产物感知变强了”
- “用户知道当前跑到哪、下一步是什么了”

但还没有做到：

- 真正的断点继续
- 真正的 rollback
- 真正的 skip
- 真正的并行任务调度

当前这版更准确地说，是“为第二阶段 runtime 重构准备好的工作台壳层”。

## 4. 已验证内容

已执行：

- `pnpm.cmd build`

结果：

- workspace 全量构建通过
- `apps/control-room` 构建通过
- `apps/orchestrator` 构建通过
- 相关 packages 编译通过

说明：

- 当前代码在类型和打包层面是自洽的
- 本轮没有停留在纯设计稿，而是已落成可编译版本

## 5. 本轮涉及文件

已修改：

- `apps/control-room/src/App.tsx`
- `apps/control-room/src/styles.css`
- `apps/orchestrator/src/app.ts`
- `packages/db/src/repository.ts`

## 6. 当前停留点

现在最合理的停点已经不是继续堆 UI，而是进入第二阶段：

- 把 checklist 上显示的“checkpoint / ready / blocked / awaiting review”从前端推导，升级成 runtime 的一等状态

否则会出现一个问题：

- 页面已经像工作台了
- 但控制能力还停留在 demo 运行按钮

这会形成“看起来能控，实际上不能控”的错位。

## 7. 下一阶段计划

建议按下面顺序推进。

### P0：补运行控制模型

新增持久化实体，建议至少包括：

1. `workflow_runs`
2. `stage_runs`
3. `task_runs`
4. `checkpoints`
5. `run_actions`

建议目标：

- 一个 project 可以有多次 workflow run
- 一个 workflow run 可以有多个 stage run
- 一个 stage run 可以拆成多个 task run
- checkpoint 必须能标记“此处可恢复”
- run action 必须记录：
  - action type
  - actor
  - reason
  - target stage / task
  - timestamp

### P1：补状态机和动作语义

`task_runs.status` 建议至少扩成：

- `pending`
- `ready`
- `running`
- `blocked`
- `awaiting_review`
- `succeeded`
- `failed`
- `skipped`
- `rolled_back`
- `reused_from_checkpoint`

动作建议先做三类：

1. `resume_from_checkpoint`
2. `skip_stage`
3. `rollback_to_checkpoint`

注意：

- `skip` 不能只是把状态改掉，必须记录原因
- `rollback` 不应该删除旧产物，而应新开一条 attempt / branch
- `resume` 只允许从 checkpoint 恢复，不建议支持任意位置恢复

### P2：补 orchestrator API

建议新增：

1. `GET /api/runs/:runId`
2. `POST /api/runs/:runId/resume`
3. `POST /api/runs/:runId/skip`
4. `POST /api/runs/:runId/rollback`
5. `GET /api/runs/:runId/events` 或 SSE

### P3：把并行从“展示预留”升级成“真正执行”

当前 `definitions.ts` 里一些节点已经有多个角色，但 runtime 仍只取第一个角色。

第二阶段应改成：

- 阶段声明执行模式
  - `serial`
  - `parallel_all`
  - `parallel_any`
- 多角色并发产出独立 task run
- 后面增加 merge / adjudicate 节点

## 8. 下次回来建议的第一件事

不要再先改样式。

下次回来最值钱的第一步应该是：

1. 先定义 `workflow_runs / stage_runs / task_runs / checkpoints / run_actions` schema
2. 再改 repository
3. 再改 runtime
4. 最后把 control-room 上的按钮接成真动作

顺序不要反。

## 9. 当前结论

这轮已经把“任务真的太不直观”这个问题解决了一半：

- 可视化结构已经对了
- 产物感知已经明显增强

剩下的一半不在 UI，而在 runtime：

- 能不能断点继续
- 能不能 rollback
- 能不能 skip
- 能不能并行后再汇总

这些能力现在还没有实现，下一轮应直接进入执行控制层。
