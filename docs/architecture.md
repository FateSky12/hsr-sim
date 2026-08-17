# 实现边界

## 目标

核心模块通过 `BattleKernel.step` 接收一个动作命令，返回新的 `BattleState`、不可变 `ReplayEvent[]` 和新的 RNG 状态。引擎不依赖 DOM、React 或 Node API。

## 当前覆盖

| 能力 | 覆盖状态 |
| --- | --- |
| 基础属性、暴击、增伤、防御、抗性 | abstracted |
| 资源、韧性、击破、超击破 | abstracted / versioned formula seam |
| 绝对行动时间轴、行动提前/延后 | abstracted |
| 固定脚本、确定性回放 | verified（相对于本仓库规则） |
| 固定 StarRailRes revision 的 95 角色基础数据 | abstracted / source-pinned |
| 直接攻击、护盾、治疗、净化、行动提前、简单增益、状态叠层和常见概率 DoT 转换 | abstracted / conservative |
| L3 代表机制：嘲讽/护盾触发、HP 自损、弱点植入、非弱点削韧、Super Break、Break DoT、召唤行动条 | abstracted / regression-covered |
| 四人队场景入口、受击能量校准回调、简单光锥/遗器事件被动 | abstracted / calibration seam |
| 固定数据角色目录、命途匹配光锥基础属性和角色分享回放重建 | verified（相对于固定快照与仓库规则） |
| 真实客户端 4.4 数值和全部角色机制 | unsupported |

`verified` 只表示仓库内规则经过测试，不表示已经通过客户端逐字段校准。

## 当前实现

```text
packages/engine      状态、属性、伤害、韧性、DoT、绝对时间轴、step
packages/data        zod 数据 schema、版本化 StarRailRes/TurnBasedGameData 快照与 HSR-Scanner 适配器
packages/content     JSON effect blocks -> engine EffectIntent
packages/scenarios   场景初始化与计分适配器
packages/policy      固定脚本与最小 APL 优先级策略
packages/replay      typed-array 编解码、分享 payload、状态 hash、L0-L3 校准/黄金用例
packages/cli         编译后 CLI 训练场景
packages/search      候选生成、静态粗筛、完整模拟精算
apps/web             Vite + Worker 池、APL、遗器导入、搜索与压缩分享回放
```

第一条端到端切片已经覆盖：基础攻击、技能点/能量、modifier 增益、单次命中上下文 hook、护盾吸收、治疗/净化/复活、带效果命中判定的 DoT 施加快照、元素击破附加效果、削韧/击破、优先级 hooks、仇恨目标选择、期望值/采样两种暴击模式、行动调度、四人队状态、波次、回放文档和 Worker 运行。伤害事件同时保留 `BEFORE_HIT → BEFORE_DAMAGE → DAMAGE_DEALT → AFTER_DAMAGE → AFTER_HIT` 边界；资源和行动条变化有专用事实事件。`runGoldenCase` 会重放完整命令/事件轨迹，并比较动作数、事件数、循环、逐跳伤害、行动顺序和最终状态 hash。

`BattleKernel` 默认使用 `expected` 伤害模式，适合配装比较；需要单次随机战斗时传入 `new BattleKernel(rules, 'sampled')`。引擎内置的破韧等级表已按固定 4.4 `AvatarBreakDamage` 快照更新（Lv80 = 3767.5535，Lv95 = 7494.3716），并保留元素击破系数和原始韧性点口径下的 `0.5 + maxToughness / 120` 默认系数；`BattleKernelOptions` 仍可覆盖等级表、击破基础值、击破 DoT 基础值和韧性系数，便于按客户端录像校准。超击破使用 `(等级倍率 × 削韧值 / 10 × (1 + 击破特攻) × Super Break 增益)`，不再误用火/物理等元素击破系数。默认常数和当前敌人/场景派生仍标记为 `abstracted`，未通过 4.4 客户端黄金录像前不能称为 1:1。

固定快照当前包含 95 个角色、165 个光锥、742 件遗器和 60 套遗器的索引/派生数据；直接目录的保守转换共 256 个基础/技能/终结技能力，已覆盖单倍率 Blast、常见 Bounce 多段/随机目标伤害，以及少量群体速度、抗性穿透、战技点和百分比能量恢复形状。基础攻击现在明确带 10 点削韧，AoE 与全队支持分别使用 `all_enemies` / `all_allies`，避免把命令里的一个显式目标误当成整场目标集合。上游没有明确声明的角色资源增益不会由 registry 猜测补齐，避免把通用默认值伪装成 4.4 客户端规则；应在角色数据或 L3 模块中显式录入。覆盖报告同时记录 direct damage 与 compiled utility 的数量，当前固定快照为 direct skill 57、direct ultimate 66、compiled skill 78、compiled ultimate 83；这些数字不能解读为“全部角色已 1:1 支持”。新增的 L3 代表模块覆盖三月七、布洛妮娅、阮·梅、流萤、忘归人、黄泉、砂金、同谐开拓者、记忆开拓者和阿格莱雅的核心状态切片；光锥被动、复杂套装条件、星魂、独有资源的完整客户端语义仍需继续校准。

`ScenarioDefinition` 把三种模式的版本、敌人、波次和计分权重保持在数据层；仓库提供 `packages/scenarios/fixtures/` 下的三份版本化 abstracted 示例，同一引擎可通过配置切换忘却之庭、末日幻影和虚构叙事。网页的参数化敌人编辑器使用同一套 `parseEnemyConfig` 和 `enemyToRules` 接缝，支持弱点、抗性、韧性、行动模式、击破延后和阶段事件。当前示例仍是 `abstracted`，不代表某个当期关卡已校准。

除抽象 fixture 外，网页构建还复制一份固定 TurnBasedGameData revision 的客户端派生目录，提供 91 个角色的 80 级面板/技能 ID 目录、3 个显式选择的 4.4 StageConfig 波次、7 个相关敌人模板和 1..120 破韧等级表。它们可运行、可回放、保留客户端 ID 和来源 revision；由于本目录尚未包含完整的客户端 AI/阶段技能语义与真实 L3 录像，敌人使用 basic fallback，场景计分仍是适配器参数，不宣称当期关卡 1:1。

`runScenario` 会把同一策略和同一事件流跨越所有定义波次；简写的“一个敌人模板 + totalWaves”会在解析时展开为稳定的 `wave-1...wave-N`，因此场景 fixture 仍可被回放。网页构建会把三份 fixture 复制到静态 `data/scenarios/`，Worker 只传场景 ID，不把函数或类实例跨 Worker 边界。

## 包依赖

```text
data -> content -> engine
data -> scenarios -> engine
policy -----------^ 
replay -> engine
cli/web -> engine + content + data + policy + replay + scenarios
```

`engine` 是规则深模块；内容、场景、策略和宿主通过适配器接入。
