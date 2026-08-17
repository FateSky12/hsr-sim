# 数据源与版本边界

`packages/data` 分成三层。上游目录结构和文件职责以 [Mar-7th/StarRailRes](https://github.com/Mar-7th/StarRailRes) 为准：

1. `schema.ts`：内部可执行数据的运行时 schema；
2. `upstream.ts`：StarRailRes 索引适配器，只解析目录信息，不把上游文本或参数直接当成战斗逻辑；
3. `loader.ts`：[HSR-Scanner](https://github.com/kel-z/HSR-Scanner) v4 风格的遗器实例适配器，导入结果必须带来源 revision。

同时，`turnbased.ts` 适配固定 revision 的 [Dimbreath/turnbasedgamedata](https://gitlab.com/Dimbreath/turnbasedgamedata) 客户端表：`EquipmentSkillConfig + TextMapEN` 用于生成光锥的可解析被动片段，`MonsterConfig + MonsterTemplateConfig + TextMapEN` 用于生成敌人目录，`StageConfig` 用于保留明确选择的波次，`AvatarBreakDamage` 用于生成等级破韧表。它们是客户端数据源，不等于已经完成战斗语义逆向；派生记录继续带 `abstracted` 覆盖标记。

## 拉取固定版本

不允许默认跟随 `master`。调用方必须显式提供 Git revision：

```bash
npm run data:fetch -- <StarRailRes-git-revision> en
npm run data:compile -- <StarRailRes-git-revision> en
npm run data:compile:direct -- <StarRailRes-git-revision> en
npm run data:compile:equipment -- <StarRailRes-git-revision> en
npm run data:compile:turnbased -- <TurnBasedGameData-git-revision> <MonsterConfig.json> <MonsterTemplateConfig.json> <StageConfig.json> <TextMapEN.json> <AvatarBreakDamage.json> <output-dir> [stageId:mode ...]
npm run data:coverage -- <StarRailRes-git-revision> en
```

文件会保存到 `packages/data/generated/starrailres/<revision>/`，并生成 manifest。当前仓库只提交 fixture，不把上游素材或未校准战斗参数伪装成已验证规则。

当前工作区已保存并测试 revision `b95e75c7e1273d819d20c530c0b7e13a3ef19fb4` 的英文快照：95 个角色索引、165 个光锥索引、742 个遗器定义和 60 个套装索引。

StarRailRes 的索引目录包含角色、光锥、遗器、套装、晋阶和技能等 JSON；这些索引适合做目录和导入来源，运行时技能机制仍需转换为本项目的 `EffectBlock` 或 L3 hook，并逐项校准。当前仓库已保存一个固定 revision 快照；原始索引仍标记为 `unsupported`，派生目录按各自的 `abstracted/unsupported` 覆盖状态标记，不会被默认当作客户端 1:1 规则。

`data:compile` 会生成只覆盖普攻的 `basic-characters.json`。它可以进入内容 registry，但仍标记为 `abstracted`；技能、行迹、星魂、光锥被动和角色独有资源需要继续单独录入。

`data:compile:direct` 另外转换可识别的单段单体、群攻、单倍率 Blast 和常见 Bounce 多段直接伤害战技/终结技，以及少量安全的护盾、治疗、净化、行动提前、群体速度/增益、战技点、百分比能量恢复和概率 DoT 形状；基础攻击固定记录 10 点削韧，群体伤害使用 `all_enemies`，群体辅助使用 `all_allies`。Bounce 的每一段会进入可播种 RNG 的独立伤害实例，含 HP 损失累计、多项求和、召唤、复杂支援和状态机技能仍会保留在原始索引中，由 content registry 的 L3 模块显式接管，不会被这个保守转换器误建模。Blast 会按有序目标列表拆成主目标与前两个相邻目标。

`data:compile:equipment` 会生成固定等级的光锥基础属性目录和遗器套装静态属性目录。若额外传入由 `data:compile:turnbased-lightcones` 生成的 mechanics 文件，则会把客户端文本参数中能安全识别的静态属性、普攻/战技/终结技/追加攻击/击破等触发增益编译进 `passives[]`；不支持状态、概率、能量、叠层或复杂条件的部分不会被伪装成完整机制，目录仍标记为 `abstracted` 或 `unsupported`。复杂套装条件和遗器实例随机词条分别标记为 `abstracted`。

`data:compile:turnbased` 会把指定的 4.4 StageConfig 编译成显式 `wave-1...wave-N`，并输出敌人模板、客户端 ID、弱点/抗性和 `AvatarBreakDamage` 等级表。阶段技能目前只保留 `skillIds` 来源信息，敌人运行时使用保守 basic fallback；这条路径能保证“源数据可追溯、波次可回放”，但不能声称 Boss 行为或当期计分已 1:1。

`data:compile:turnbased-avatars` 会把 `AvatarConfig`、80 级 `AvatarPromotionConfig`、每个角色的最高等级 `AvatarSkillConfig` 和英文 TextMap 编译成 91 个角色的面板/能量/技能参数目录。技能描述、削韧展示值和参数已经保留，但只作为后续 L1/L2 转换器的输入；复杂状态机、召唤物、额外攻击和多阶段技能仍标记 `abstracted`。

`data:coverage` 会输出逐角色的普攻/战技/终结技转换状态和技能 effect 类型计数，作为版本更新后的缺口清单。

资源增益（战技点、能量）只有在上游或角色 L3 数据明确给出时才会进入 `ActionDefinition`；转换器不会把不确定的角色专属资源机制统一猜成同一个默认值。真实面板/录像校准请使用 [`docs/calibration.md`](./calibration.md) 的 JSON 格式，并通过 `npm run calibrate -- <file>` 执行。

HSR-Scanner 的 `relics[]` 导出使用 `set_id`、`mainstat`、`substats`、`preview_substats`、`location` 和 `_uid` 等字段；解析器会忽略预览词条、把带下划线的百分比词条归一化为内部小数，并依据固定 StarRailRes 主词条公式补出没有数值字段的主词条。5 星主词条公式来自当前固定快照，非 5 星使用保守缩放，结果仍标记为 `abstracted`。

敌人配置使用 `parseEnemyConfig` 归一化方案里的 `defBase/maxToughness/resOverrides` 别名；配置本身仍需带来源 revision，并默认标记为 `abstracted`，不会被误报成当期 Boss 校准数据。
