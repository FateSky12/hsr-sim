# 校准文件

校准不是把抽象规则写成“已验证”。它是把游戏客户端面板、单跳伤害和行动顺序的观察值保存为 JSON，再让 CI 对每次引擎修改重跑。

文件格式固定为 `schemaVersion: 1`，可以同时包含 L0 面板、L1 伤害和 L2 行动顺序：

```json
{
  "schemaVersion": 1,
  "name": "recording-2026-08-14-firefly-skill",
  "source": "local-client-recording-2026-08-14",
  "panel": {
    "expected": { "hp": 1000, "atk": 200, "def": 300, "spd": 134, "critRate": 0.7, "critDmg": 1.5, "breakEffect": 0.8, "effectHitRate": 0.2 },
    "observed": { "hp": 1000, "atk": 200, "def": 300, "spd": 134, "critRate": 0.7, "critDmg": 1.5, "breakEffect": 0.8, "effectHitRate": 0.2 },
    "speedTolerance": 1
  },
  "damageTrace": [
    { "index": 0, "expected": 84213, "observed": 84190, "tolerance": 0.005, "source": "skill-hit-0" }
  ],
  "actionTrace": [
    { "index": 0, "expectedActor": "firefly", "observedActor": "firefly", "expectedAbility": "skill", "observedAbility": "skill", "expectedAt": 0, "observedAt": 0, "atTolerance": 0.000001 }
  ]
}
```

运行方式：

```bash
npm run calibrate -- path/to/calibration.json
```

命令返回非零退出码表示存在不匹配。`observed` 是模拟器结果，`expected` 是客户端记录；两者不能调换。当前仓库没有伪造真实客户端录像，`tests/golden/training-slice.json` 仍是内部规则黄金用例，不等同于 4.4 客户端校准。

`npm test` 会自动枚举 `tests/calibration/*.json`，把每一份已导入的面板、单跳伤害和行动顺序观察作为回归门禁；拿到真实录屏后只需新增带真实 `source` 的 JSON，不需要改测试代码。当前目录中的 sample 明确标记为仓库 fixture，不能当作客户端证据。

击破相关录像还应单独覆盖：Lv70/Lv80/Lv95 等级倍率、火/物理/冰/雷/风/量子/虚数元素系数、最大韧性的原始点口径、普通击破 DoT、非弱点削韧和 Super Break。引擎当前内置固定 4.4 `AvatarBreakDamage` 表（例如 Lv80 = 3767.5535），默认韧性系数仍是 `0.5 + maxToughness / 120`，但 `BattleKernelOptions` 可按录屏替换这些常数；不要把客户端表、社区页面的 `/40` 与 `/120` 口径混用。
