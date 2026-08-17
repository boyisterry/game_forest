# ForestCourierRig v1 · 统一骨架与动作规范

## 目标

ForestCourierRig 是后续新角色的唯一骨架与动作母版规范。新角色直接绑定母版后，基础动作只制作一次。现有兔子、狐狸和虎子的旧骨架绑定轴差异很大，运行时保留各自定制 Clip，只统一上层动作接口。整个流程只使用项目代码、Three.js 和本机 Blender，不调用任何外部绑定或动画 API。

## 权威来源

- 身体主骨架：兔子信使的 41 节 Tripo Biped。
- 动物补充骨骼：虎子信使的 4 节尾巴链。
- 母版骨骼总数：45。
- 身体母版动作源：`public/models/characters/rabbit/rabbit-courier-rigged-runtime.glb`。
- 尾巴母版动作源：`public/models/characters/tiger-tpose/tiger-courier-rigged-runtime.glb`，只读取 `tail.01..04`。
- 代码规范：`app/lib/animation/forestCourierRig.ts`。

兔子的骨骼名称保持为母版名称，避免重新命名现有动作产生损失。新增尾骨使用 `Tail01` 到 `Tail04`，`Tail01` 挂在 `Pelvis` 下。

## 统一骨架层次

```text
Root
└─ Hip
   ├─ Pelvis
   │  ├─ L_Thigh → L_Calf → L_Foot → L_ToeBase
   │  ├─ R_Thigh → R_Calf → R_Foot → R_ToeBase
   │  └─ Tail01 → Tail02 → Tail03 → Tail04
   └─ Waist → Spine01 → Spine02
      ├─ NeckTwist01 → NeckTwist02 → Head
      ├─ L_Clavicle → L_Upperarm → L_Forearm → L_Hand
      └─ R_Clavicle → R_Upperarm → R_Forearm → R_Hand
```

兔子原有的上臂、前臂、大腿和小腿 Twist 骨全部保留。它们负责改善关节扭转形变，但不是旧角色接入时的硬性要求。目标角色没有 Twist 骨时，母版动作仍由主肢体骨驱动。

## 动作母版规则

每个动作必须输出到同一套 45 节母版骨架，不能为某个动物单独修改身体动作。

| 动作 | 循环 | 位移规则 | 同步组 |
|---|---|---|---|
| `idle` | 循环 | 原地 | locomotion |
| `walk` | 循环 | 原地 | locomotion |
| `run` | 循环 | 原地 | locomotion |
| `jump` | 单次 | 高度由玩法控制 | airborne |
| `walk_jump` | 单次 | Walk 引导后进入角色 Jump | airborne |
| `run_jump` | 单次 | Run 引导后进入角色 Run Jump/Jump | airborne |

制作要求：

1. 动画轨道不得包含 Scale。
2. `Root` 只保存骨架基准方向，不承载角色在地图中的移动。
3. `Hip` 保存身体起伏。当前兔子资源的竖直位移误写在 Hip local-X，构建母版时必须烘焙到 Hip local-Z。
4. Walk 和 Run 的首尾姿势必须无跳变，并保持一致的左右脚相位定义。
5. Jump 只保存身体姿态；实际离地高度、重力和落地由游戏控制器处理。
6. `Tail01..04` 是统一动作的一部分。无尾角色忽略这些轨道；长于 4 节的尾巴从 `Tail04` 之后使用本地次级运动，不增加另一套身体动作。
7. 表情、耳朵、翅膀、触角等物种扩展使用独立 Additive 层，不得修改基础身体动作。

### 当前运行时策略

统一分为两层：

1. 上层动作接口统一为 `idle / walk / run / jump / walk_jump / run_jump`，玩法和 UI 不依赖 GLB 内部 Clip 名称。
2. 新角色必须直接绑定 ForestCourierRig v1，并消费兔子身体母版与标准尾巴层。
3. 现有旧角色继续播放与自身绑定姿势匹配的定制 Clip，不做浏览器运行时跨骨架重定向。
4. 兔子仍执行颈部抬头、Hip 轴修正和逐帧落地修正。
5. 狐狸明确使用 `CombatIdle / Walk / Run / RunJump`；组合动作通过 Walk/Run 引导后进入克隆的 RunJump。
6. 虎子明确使用 `walk / run / jump / run_jump`；Idle 从原生站立帧生成轻微呼吸，Walk Jump 使用 Walk 引导后进入 Jump。
7. 兔子的 Walk Jump 与 Run Jump 分别先播放 Walk/Run 引导，再进入兔子自己的 Jump。

原因：现有兔子的 `Root → Hip → Pelvis` 基轴、狐狸的 `root → hips` 以及虎子的 Blender 骨骼局部轴不一致。通用重定向可以生成合法轨道，但会导致狐狸整身倾倒、虎子肩臂和腿部扭转。只有离线人工校准并烘焙到目标绑定姿势后，旧骨架才能安全消费母版动作。

## 现有角色桥接

### 兔子

兔子是母版来源，41 节身体骨一一对应。当前没有尾骨，因此忽略尾巴轨道。新版本兔子如果增加尾巴，应直接使用 `Tail01..04`。

### 狐狸

狐狸保留现有 29 节蒙皮骨架和定制动作。以下语义映射只用于离线迁移、检查和未来重新绑定，不直接用于当前展示页：

- `hips` ← `Pelvis`
- `spine_01 / spine_02 / chest` ← `Waist / Spine01 / Spine02`
- `clavicle_L / upper_arm_L / lower_arm_L / hand_L` ← 对应兔子左臂
- `thigh_L / shin_L / foot_L / toe_L` ← 对应兔子左腿
- `tail_01..04` ← `Tail01..04`
- `tail_05..06` 保留为狐狸扩展，由尾巴次级运动继续驱动

### 虎子

虎子的 25 节骨架是尾巴参考来源。当前身体与尾巴均播放虎子定制动作；以下映射只用于离线迁移和重新绑定：

- `hips` ← `Pelvis`
- `spine / chest` ← `Spine01 / Spine02`
- `shoulder.L / upper_arm.L / forearm.L / hand.L` ← 对应兔子左臂
- `thigh.L / shin.L / foot.L / toe.L` ← 对应兔子左腿
- `tail.01..04` ← `Tail01..04`

## 新动物绑定流程

### 首选：直接绑定母版骨架

1. 模型整理为自然 T-Pose 或 A-Pose，四肢互不粘连。
2. 使用 ForestCourierRig v1 的 45 节骨架，不改名、不调整层级。
3. 无尾动物仍保留 `Tail01..04`，但不给顶点权重。
4. 不需要的 Twist 骨可以不分配权重，但不能改变母版动作名称。
5. 完成蒙皮后直接挂载母版动作，无需动作重定向。

### 兼容：保留已有骨架

1. 为角色新增 `ForestCourierRigProfile`。
2. 映射骨盆、两段脊柱、头颈、肩臂、手、腿、脚和脚趾。
3. 使用本地 `retargetForestCourierActions()` 从兔子母版生成目标 Clip。
4. 只在映射配置中处理比例、轴向和缺失骨骼，不复制或修改动作源文件。
5. 通过 `npm run rig:validate` 检查骨骼名称和必要语义覆盖率。

## 本地构建流程

```text
ForestCourierRig 母版动作
               │
               ├─ 直接播放 → 按统一骨架绑定的新动物
               │
               └─ 离线重定向 + 人工校准 + 烘焙
                                  │
                                  └─ 旧骨架的角色定制 Clip / GLB
```

角色展示页只播放已验证的角色定制 Clip。`retargetForestCourierActions()` 保留为开发和离线迁移工具，不得把其未经视觉验收的输出直接作为运行时动作。重新烘焙后的结果仍须符合 `forest-courier:v1` 上层动作契约。

## 验收标准

- `npm run rig:validate` 全部角色显示 PASS。
- 必要语义骨骼映射 100%。
- Idle、Walk、Run 连续播放 10 个循环无头部、手腕和脚踝翻转。
- Walk ↔ Run 切换保持脚步相位。
- 脚底在接触帧不穿地，Jump 不被贴地逻辑抵消。
- 肩部、肘部、膝部最大弯曲时无明显塌陷。
- 有尾角色使用同一套 `Tail01..04` 轨道；额外尾节只做次级运动。
- 所有构建和验证在断网状态下可以完成。

## 版本策略

- 动作只能依赖同一主版本的骨架，例如 `forest-courier:v1:walk`。
- 增加可选扩展骨不升级主版本。
- 删除、重命名、改父级或修改必要骨语义必须升级到 v2。
- 旧角色映射配置必须保留，以便重新构建历史资产。
