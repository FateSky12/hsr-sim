# HSR Sim

一个以“可验证、可回放、可扩展”为第一目标的《崩坏：星穹铁道》战斗模拟器 TypeScript 工作区。

当前版本是可运行的核心纵向切片，明确标记为 `abstracted`，不宣称与游戏客户端 1:1 一致。它已经包含：

- 纯数据战斗状态与确定性 RNG；
- 属性计算、暴击/增伤/防御/抗性伤害管线；
- 战技点、能量、韧性、击破和超击破抽象；
- 绝对时间轴、行动提前/延后与插入行动；
- typed effect intents、固定脚本和不可变回放事件；
- 光锥/遗器主副词条、静态套装和少量可解析的装备被动参与战斗转移；
- 配装候选生成、静态粗筛、完整战斗精算、仇恨目标选择和 APL 文本策略；
- CLI 模拟入口、Vitest 行为测试和 Vite 网页壳；
- 固定 StarRailRes revision 的基础/直接技能/装备派生快照（含常见 Bounce 多段伤害），以及 HSR-Scanner 遗器 JSON（文件或粘贴）导入；
- 固定 TurnBasedGameData revision 的 91 个角色面板/技能目录、破韧表、敌人模板和选定 4.4 波次快照；光锥文本/参数中可安全识别的部分被动会进入 `passives[]`，仍按 `abstracted` 标记；
- Worker 池运行、压缩分享回放校验和 L0/L1/L2/L3 校准/黄金用例执行器；
- 代表性 L3 状态机：三月七嘲讽/护盾反击、布洛妮娅行动提前、阮·梅击破延长、流萤燃烧状态、忘归人/同谐开拓者 Super Break、黄泉层数、砂金筹码/追加攻击和记忆召唤物；
- 三类版本化抽象场景的波次运行入口，以及可由 CLI 读取的 L0/L1/L2 校准 JSON；
- 网页可从固定目录选择 95 个角色，配置四人队伍，加载匹配命途的固定光锥基础数据后运行真实派生能力。

超击破 intent 如果提供 `toughnessDamage`，会走独立的削韧值公式；当前默认等级倍率表来自固定 4.4 客户端表并有回归测试，但尚未用真实客户端黄金录像逐项校准，角色完整机制、光锥未解析语义和当期关卡计分仍按覆盖报告标记为待校准或不支持。

## 开发

```bash
npm install
npm run check
npm run build
npm run simulate
npm run dev
```

网页包含训练场景、忘却之庭/末日幻影/虚构叙事的抽象 fixture、固定角色目录、APL 编辑器、遗器导入、可编辑敌人 JSON 和两阶段配装搜索。构建时会把固定 revision 的派生 JSON 与三份场景 fixture 复制到静态 `data/` 路径；导入的完整遗器库会进入候选搜索；未知套装会以“无条件套装效果”的 abstracted 占位集载入，因此不会伪称套装被动已复刻。固定上游索引可以通过：

```bash
npm run data:fetch -- <StarRailRes-git-revision> en
```

详细的实现范围、数据来源和校准边界见 [`docs/architecture.md`](./docs/architecture.md)。
真实客户端观察值的 JSON 格式和 CLI 用法见 [`docs/calibration.md`](./docs/calibration.md)。
