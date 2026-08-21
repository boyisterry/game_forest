# 雨港新城：满图密度下的城市地图性能架构

| 字段 | 值 |
|---|---|
| 文档标题 | Forest Courier · 城市地图性能优化设计稿 |
| 作者 | Forest Courier · Map Workshop |
| 日期 | 2026-08-19 |
| 修订 | 2026-08-21 r4.17：R12 连续远景 calls 门闭合，保留 3,200m 骑行视距 |
| 状态 | **主线实现与目标硬件发布门均已完成** |
| 产品 | Forest Courier · Map Workshop (`forest-courier-map-studio`) |
| 范围 | 城市地图的渲染、阴影、碰撞查询与编辑器交互性能 |
| 非范围 | 森林地图、车辆动力学、追逐相机、破碎系统、视觉美术重做、i18n 框架 |
| 前置文档 | `docs/superpowers/specs/2026-08-15-city-map-editor-design.md` |

---

## 1. 结论

原始诊断（2026-08-19）：Cedar Crossing 117 个 placement 下主要渲染瓶颈是批次作用域过小，而非几何面数不可控。现有 `InstancedMesh` 按“模板 × 256 m 单元格 × visual batch”切分，在稀疏地图中接近每个 placement 单独生成一组批次，无法随同类建筑增加而摊销。据此完成的路线（阶段 0A–5，见 §8）：`mapLod` 标签、BatchedMesh 能力 spike、混合 `CityBatchWorld`、AABB 可见集、道路 profile 合并。

**2026-08-21 实施后的修订结论：**

1. **R0 已落地，两个 Node 结构口径已经统一。** 当前 166-placement Cedar 为 1,414/1,001 range（instanced）与 575/276（batched）；两条路径的颜色/阴影 triangles 都分别为 **755,614 / 499,418**。预算测试已参数化两条 backend，BatchedMesh 私有结构、材质/祖先可见性、零实例与 drawRange 边界均有守护。见 §2.0。
2. **R3 primitive geometry cache 已落地。** 安全键包含 primitive 参数、最终 attribute/index 内容、typed-array/GPU 解释、groups/drawRange 与碰撞相关语义名。33 工厂实测 61,041 → 4,603 geometry、98.92 → 40.23 MB；F2 复核后的 Cedar、空间 20×、6 排展示区三组工作集分别为 27,869 → 3,428、27,869 → 3,428、10,337 → 256。统一 `disposeSceneResources`、generation/lease retirement、HMR live-generation、开发态 mutator 与 checksum 守护均已接入。见 §4、§9.9。
3. **R2 的 BatchedMesh pool 与冻结 shadow frustum 合同已实现。** pool 设置 `frustumCulled=false`；shadow refresh 原子提交 sun/target/ortho camera/matrix/frustum，普通帧复用冻结快照；batch 以真实 AABB 做 color/shadow union，仍与 authored visibility 合成。Node 边界测试、Chromium 实际渲染和目标 GPU 路线截图已通过人工完整性检查；由于本轮之前没有同 pose 历史基线，当前截图只能建立基线，不能倒推成自动像素差分已通过。
4. **R4 展示区渲染预算已覆盖全部 15 个独立 demo。** 统一动态 DPR、320 ms 静态休眠、100 ms 连续动画阴影节流与显式 `continuous` 活动合同；最重三个 demo 另接点光源池和结构阴影策略。Chromium 验证最重静态场景休眠后 650 ms 为 0 draw，触发破碎后恢复连续绘制；目标 GPU 已保存并人工检查最重标准小区全景截图。见 §9.12。
5. **§9.1 碰撞与渲染可见性分离已闭合。** 三类 render-proxy helper 已统一写 `renderProxySource`，solid/surface packer 共用全祖先链 `isCollisionSourceEligible()`；catalog source 提供默认开启、仅供测试/探针关闭的 `optimizeStatic`。自动发现的 17 个真实 factory 全部通过 solid/surface byte-exact pre/post 与代表性圆扫掠 TOI/法线等价验收，累计恢复 912,262 个 solid 与 10,484 个 rideable source triangle。
6. **R5 mapLod 三阶段指标已落地。** 32 个 factory 模板逐一采集合批前、合批后与 mapLod 后的 effectively-visible mesh、有效 triangles、共用安全 material key、solid/surface collision triangles；F2 复核后的全量汇总分别为 mesh **77,507 → 10,679 → 7,665**、triangles **1,271,400 → 1,270,944 → 1,142,574**、逐模板 material-key 数之和 **1,019 → 1,019 → 925**。新增的 134 个可见 mesh 是此前被错误合并的 hook 可变灯具 source，三角形、材质键与碰撞不变；审核过的 8 个重模板仍有严格 mapLod 降幅。见 §9.2、§9.13。
7. **R6 静态城市阴影与骑手阴影已拆分。** 城市模式下骑手所有 mesh 的 `castShadow=false`；独立两三角形 shader 椭圆按 rideable surface 高度/法线贴合，使用固定太阳方向决定长轴与偏移，带透明衰减、polygon offset 和离地渐隐。静态 shadow map 不再响应骑手姿态，只在焦点越过 4 m dead zone 且满足 100 ms cadence 后原子刷新。Cedar Chromium 骑行稳态 184 帧观测：骑手静态投射者 **0**、contact shadow 可见、静态 shadow refresh **0**。见 §9.3。
8. **R7 空间分布 fixture 与目标硬件采样均已落地。** Cedar 当前 166 placements、55 roads 连同节点、边、intersection overrides 按 5×4、40 m 间距完整复制，20× 为 3,320 placements / 1,100 roads。Apple M5 Pro / ANGLE Metal、1920×1080、DPR=1 完成独立 10s 预热与 8/12/10s 三路线；GPU timer、CPU render、RAF、普通/阴影帧及显式 color/shadow pass calls 全部分栏，探针漏采为 0。首次采样发现骑行 220m far plane 虽有 9.2ms RAF P95，却把远路和建筑齐切断，判定为体验失败并撤销；3,200m + 原有雾/far LOD 复测视觉连续，20× 骑行 RAF/CPU/GPU P95 为 11.8/9.7/4.99ms，但 color/shadow calls P95 升至 631/171，转入 R12。见 §9.7–9.8。
9. **R8 far LOD、baseTint 与拾取宽相已落地。** 33/33 catalog 模板各生成一个 12-triangle massing proxy；其余 opaque slots 与透明/特殊 fallback 在 far 档隐藏，4.5%/6% 屏幕半径滞回与 authored/render-set visibility 合成。20× 全图 SwiftShader 从 **4,111 calls / 34.32M triangles** 降到 **49 / 0.85M**；Cedar 骑行近景保持 110 / 396k。批处理与 fallback 均先做 placement AABB，再对候选 canonical near geometry 精确 raycast，不切换渲染可见性；1,660/3,320 placements Chromium 分别为 0.8/1.4ms，2,500 placement Node 热路径约 0.036ms。见 §9.4–9.6。
10. **R10 编辑器增量提交已闭合。** placement add/update/remove 只重建受影响的 `catalog × 512 m cell` fallback attachment；BatchedMesh 直接原位 add/move/remove，未影响 pool 保持对象 identity。碰撞编译以内容寻址复用未变道路 64 m chunk，并基于上一代不可变 runtime 只规范化变化 owner、copy-on-write 更新受影响 16 m bucket；旧 runtime 在 staging 期间持续服务，完整新代通过 generation 检查后才原子替换。2,500-placement 结构 fixture 的单对象移动只触及 1 placement / 1 catalog / 1 visual cell，Chromium 编辑流程确认 collision ready 不掉线且 `ownerIndexFullRebuild=false`。见 §9.14。
11. **R11 高度 canonicalization 与隐藏源树释放已闭合。** 每个模板只打包/编译高度 1 的 solid + surface payload，`heightScale` 从 source/cache identity 移到 owner transform；broad phase、wall/fallback Y band、surface height、逆转置法线/坡度和 boundary step 均在查询侧换算。模板两类 payload 均完成编译后释放 canonical source 的场景节点与独占 geometry，保留已 bake visual batches/material 生命周期；后续高度/yaw 编辑直接命中不可变 payload。`h=0.6/1/1.32/1.61` 的新旧路径等价 fixture 与 Chromium 释放后再次编辑均通过。见 §9.9.1。
12. **R12 连续远景 calls 门已闭合。** 单帧归因确认 `MeshPhysicalMaterial.transmission` 触发了 290 次整场景预通道；地图运行时改用保留透明度/颜色/PBR 状态的 alpha-glass 派生材质，展示源不变。opaque slot 再以白底 × `baseTint` 实例色等价归并，并将地图专用 roughness/metalness 收敛为审核过的 7/6 档；透明/多材质 fallback 单元从 256m 调整为 512m。完整 Apple M5 Pro 路线的骑行 RAF/CPU/GPU P95 为 **9.0/1.8/1.66ms**，普通颜色/阴影 calls P95 为 **148/44**，长帧 0%，3,200m 远景和商场玻璃截图人工检查通过。见 §9.8。

R0–R8、R10–R12 与 Palette F1/F2 的代码门和目标硬件发布门均已完成。R9 完整工厂 Palette intern 因收益极低继续保持 P2、不进入当前主线；R12 使用的是有实测 calls 收益的地图运行时派生材质，不改变该结论。3,200m 骑行 far plane、道路/建筑可见连续性和同 pose 视觉截图继续作为后续回归合同。

碰撞范围查询不再按旧方案重做：生产路径已经使用 **64 m 道路 owner chunk + 16 m runtime owner bucket + visit stamp 去重**。现有密度回归证明 1×、10×、20×、50×高层 placement 下，局部扫掠的候选 owner、bucket visit 与 fallback triangle visit 不随全图 owner 数增长。

---

## 2. 度量口径

### 2.0 P0：结构探针的两个口径都是坏的（2026-08-21 已修复）

修复前的 Node 探针有**两处**独立的计数错误。r1 只发现了 range，三角形同样错，且后果更重。

#### 2.0.1 effective render range（现行探针高估）

Three.js 仅当 `mesh.material` 为数组时按 `geometry.groups` 逐条提交；单材质 mesh 即使 `BoxGeometry` 带 6 个 group，也只 push 一次。已核对 three 0.178 源码：`WebGLRenderer.js:1785` 与 `WebGLShadowMap.js:347` 都是 `Array.isArray( material )` 才遍历 groups，`:1802` / `:370` 走 `else if ( material.visible )` 单次提交。

修复前 `scripts/perf-probe-draw.mjs` 与 `tests/city-performance-probe.test.mjs` 使用 `Math.max(1, geometry.groups.length)`，把单材质多 group 算成多次。下表保留 2026-08-20 的历史审查样本用于说明问题，不是当前 166-placement 基线：

| 路径 | 错误口径 color / shadow | 修正后 color / shadow |
|---|---:|---:|
| InstancedMesh | 1,693 / 1,414 = 3,107 | **831 / 606 = 1,437** |
| BatchedMesh | 391 / 185 = 576 | **349 / 185 = 534** |

因此旧 §8.4 的 1,845 / 1,509 与测试阈值 `colorRanges <= 1845`、`shadowRanges <= 1509` 已移除；当前锁定值见 §2.2。

**统一函数**（Node 结构探针与预算测试必须共用）。r2 稿里「`groups.length === 0` 时返回可见材质数」是错的：`WebGLRenderer.js:1785-1800` 在数组材质下只遍历 `geometry.groups`，groups 为空则一次都不 `push`。必须返回 **0**。

聚合层先排除自身或祖先 `visible === false` 的对象，再对每个 mesh 计数。否则合批隐藏的源网格会被算进预算。

```ts
function isEffectivelyVisible(object: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
}

function hasRenderableInstance(mesh: THREE.Mesh): boolean {
  if ((mesh as THREE.BatchedMesh).isBatchedMesh) {
    const batched = assertBatchedInternals(mesh as THREE.BatchedMesh);
    return batched._instanceInfo.some((instance) => instance.active && instance.visible);
  }
  if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
    return (mesh as THREE.InstancedMesh).count > 0;
  }
  return true;
}

function effectiveRenderRangeCount(mesh: THREE.Mesh): number {
  if (!isEffectivelyVisible(mesh)) return 0;
  if (!hasRenderableInstance(mesh)) return 0;
  const material = mesh.material;
  if (Array.isArray(material)) {
    const groups = mesh.geometry.groups;
    if (groups.length === 0) return 0;
    return groups.reduce((count, group) => {
      const slot = material[group.materialIndex];
      return count + Number(Boolean(slot && slot.visible !== false));
    }, 0);
  }
  return material && material.visible !== false ? 1 : 0;
}
```

**阴影 range：** 当前生产是 `PCFShadowMap`（`ForestScene.configureShadowBudget`）。此口径仅计 `mesh.castShadow === true`。`WebGLShadowMap.js:340` 在 `VSMShadowMap` 下 `receiveShadow` 也会进 shadow pass；若将来改 VSM，阴影预算函数必须换成 `castShadow || receiveShadow`，并重锁阈值。不要用 PCF 阈值去守 VSM。BatchedMesh / InstancedMesh 同样走该函数，不要用 group 长度。

#### 2.0.2 P0：三角形口径同样作废

探针对三角形使用 `geometry.index.count / 3`，实例数只对 `isInstancedMesh` 乘 `count`。对 `BatchedMesh` 这两条都错：

- `BatchedMesh.geometry` 是**合并缓冲的容量**，不是活跃几何量。`cityBatchWorld.ts` 的 `nextCapacity()` 还按二次幂超额分配，容量与实际占用可差近 2×；
- BatchedMesh 不是 `isInstancedMesh`，所以每份 geometry 只被计一次，**完全不乘实例数**。

实测 Cedar：

| 路径 | 探针输出 | 真实活跃三角形 |
|---|---:|---:|
| InstancedMesh | 0.345 M | 0.345 M |
| BatchedMesh | **0.280 M** | **0.345 M** |

结论：§8.4 表中「0.35 M → 0.29 M → 0.28 M」这条下降**是探针假象，真实提交三角形没有变化**。合批减少的是 draw call，本来就不减三角形。`city-performance-probe.test.mjs` 的 `triangles <= 355_000` 在 batched 路径上等于免检——它测的是缓冲容量。

**统一函数**：

```ts
function clipToDrawRange(geometry: THREE.BufferGeometry, start: number, count: number): number {
  if (!Number.isFinite(start) || start < 0 || !(count >= 0)) {
    throw new TypeError("render range start/count must be non-negative; count may be Infinity");
  }
  const rangeStart = geometry.drawRange.start;
  const rangeCount = geometry.drawRange.count;
  if (!Number.isFinite(rangeStart) || rangeStart < 0 || !(rangeCount >= 0)) {
    throw new TypeError("geometry drawRange is invalid");
  }

  // three 0.178 的默认 count 是 Infinity；它只是无上界，不能跳过非零 start。
  // renderer 最后还会把 drawEnd clamp 到 index/position count，探针必须相同。
  const availableEnd = geometry.index?.count
    ?? geometry.getAttribute("position")?.count
    ?? 0;
  const rangeEnd = Number.isFinite(rangeCount) ? rangeStart + rangeCount : Infinity;
  const clippedStart = Math.max(0, start, rangeStart);
  const clippedEnd = Math.min(availableEnd, start + count, rangeEnd);
  return Math.max(0, clippedEnd - clippedStart);
}

function assertBatchedInternals(mesh: THREE.BatchedMesh) {
  const batched = mesh as THREE.BatchedMesh & {
    _instanceInfo?: unknown;
    _geometryInfo?: unknown;
  };
  if (!Array.isArray(batched._instanceInfo) || !Array.isArray(batched._geometryInfo)) {
    throw new TypeError("BatchedMesh private fields _instanceInfo/_geometryInfo missing; three.js upgrade broke the probe");
  }
  for (const instance of batched._instanceInfo) {
    if (!instance || typeof instance !== "object") throw new TypeError("BatchedMesh _instanceInfo entry is not an object");
    const row = instance as { active?: unknown; visible?: unknown; geometryIndex?: unknown };
    if (typeof row.active !== "boolean" || typeof row.visible !== "boolean" || typeof row.geometryIndex !== "number") {
      throw new TypeError("BatchedMesh _instanceInfo entry missing active/visible/geometryIndex");
    }
  }
  for (const info of batched._geometryInfo) {
    if (info == null) continue;
    if (typeof info !== "object") throw new TypeError("BatchedMesh _geometryInfo entry is not an object");
    const row = info as { count?: unknown; indexCount?: unknown; vertexCount?: unknown; active?: unknown };
    if (typeof row.count !== "number" && typeof row.indexCount !== "number" && typeof row.vertexCount !== "number") {
      throw new TypeError("BatchedMesh _geometryInfo entry missing count/indexCount/vertexCount");
    }
  }
  return batched as THREE.BatchedMesh & {
    _instanceInfo: Array<{ active: boolean; visible: boolean; geometryIndex: number }>;
    _geometryInfo: Array<{ count: number; indexCount: number; vertexCount: number; active?: boolean } | undefined>;
  };
}

function instanceMultiplier(mesh: THREE.Mesh): number {
  return (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
}

function effectiveTriangleCount(mesh: THREE.Mesh): number {
  if (!isEffectivelyVisible(mesh)) return 0;
  if (!hasRenderableInstance(mesh)) return 0;
  const material = mesh.material;
  if (!Array.isArray(material) && (!material || material.visible === false)) return 0;
  if ((mesh as THREE.BatchedMesh).isBatchedMesh) {
    const batched = assertBatchedInternals(mesh as THREE.BatchedMesh);
    let triangles = 0;
    for (const instance of batched._instanceInfo) {
      if (!instance.active || !instance.visible) continue;
      const info = batched._geometryInfo[instance.geometryIndex];
      if (!info) continue;
      const count = info.count > 0
        ? info.count
        : (info.indexCount > 0 ? info.indexCount : info.vertexCount);
      triangles += count / 3;
    }
    return triangles;
  }
  const geometry = mesh.geometry;
  if (Array.isArray(material)) {
    const groups = geometry.groups;
    if (groups.length === 0) return 0;
    let triangles = 0;
    for (const group of groups) {
      const slot = material[group.materialIndex];
      if (!slot || slot.visible === false) continue;
      triangles += clipToDrawRange(geometry, group.start, group.count) / 3;
    }
    return triangles * instanceMultiplier(mesh);
  }
  const indexed = geometry.index;
  const start = 0;
  const count = indexed ? indexed.count : (geometry.getAttribute("position")?.count ?? 0);
  return (clipToDrawRange(geometry, start, count) / 3) * instanceMultiplier(mesh);
}
```

`_instanceInfo` / `_geometryInfo` 是 three 0.178 的私有字段。探针可以读，但必须：

1. 字段缺失时抛错，而不是静默返回 0；
2. 校验数组与条目结构（`active` / `visible` / `geometryIndex` / `count`），升级 three 改了形状时立刻失败；
3. 优先用 `geometryInfo.count`（three 已经按 indexed/non-indexed 写好的 draw 量），不要只读缓冲容量。

实例有效性同样属于统一口径：`InstancedMesh.count === 0` 时 WebGL renderer 不提交 draw；BatchedMesh 没有任何 `active && visible` instance 时 multi-draw 的 `drawCount === 0`。两者的 range 与 triangle 都必须返回 0。单材质的 `material.visible === false` 也必须同时让两项归零，不能只在 range 函数里处理。

`effectiveRenderRangeCount(BatchedMesh) === 1` 的前提是生产只在 `WEBGL_multi_draw` 可用时选择 Batched backend；扩展缺失时当前策略切到 Instanced backend。若未来允许 BatchedMesh 在无扩展环境回退逐 range 绘制，函数必须显式接收 capability/backend 参数，并返回 active ranges 数，不能继续复用 multi-draw 的 1-call 口径。

城市工厂目前几乎不设 `geometry.drawRange`（默认 `{ start: 0, count: Infinity }`，裁剪是空操作），但函数仍必须裁剪，否则将来有人设了 drawRange，预算会虚高。

`clipToDrawRange` 的单测至少锁定四组边界：默认 `{0, Infinity}` 返回完整 buffer；`{10, Infinity}` 对 `[0, 100)` 返回 90；有限 drawRange 与 group 做双向交集；group 超出 index/position 尾部时按真实 buffer count 截断。禁止为 Infinity 单独提前返回。

#### 2.0.3 P0：预算测试没有覆盖生产路径（已修复）

修复前 `cityDocumentRenderer` 默认选择 `instanced-mesh`，而唯一结构回归不传 `batchBackend`，因此只守住回退路径。现在 `tests/city-performance-probe.test.mjs` 对 `instanced-mesh` / `batched-mesh` 分别构建完整 Cedar，并使用同一个 `measureCitySceneStructure()` 锁定上下界。

预算测试已对 `"instanced-mesh"` 与 `"batched-mesh"` 两条 backend 各锁一组小余量阈值；任何主动优化导致低于下界也必须重新审查并重锁，避免“统计返回 0”假通过。

#### 2.0.4 重锁流程

锁定新预算前，按顺序执行：

1. 把 `isEffectivelyVisible` / `effectiveRenderRangeCount` / `effectiveTriangleCount` 落到一个共享模块（建议 `app/lib/map/cityStructureMetrics.ts`）。`scripts/perf-probe-draw.mjs`、`scripts/perf-probe.mjs` 与 `tests/city-performance-probe.test.mjs` 全部改用；
2. 新增 `scripts/perf-probe-factory-resources.mjs`，复现当前 33 工厂 geometry/material 对象数、primitive 可缓存量、属性字节；
3. 两条 backend 各重跑一次，替换 §2.2 与 §8.4 的表；
4. 测试改为参数化两条 backend，阈值收到修正值的小余量内（禁止继续用 1845 / 1509 / 355,000）。

**R0 已落地。** 权威实现为 `app/lib/map/cityStructureMetrics.ts`；`perf-probe-draw.mjs`、`perf-probe.mjs` 与预算测试共用。Three.js 私有字段形状不匹配时立即抛错，不静默降为 0。

浏览器 `renderer.info.render.calls` 来自真实 Three.js renderer 提交路径，可作为 calls/triangles 口径；它不是驱动计时。effective range 与 effective triangles 只约束结构回归，GPU 时间只能由 timer query（可用时）报告。同一采样窗口必须区分普通颜色帧和强制 `shadowMap.needsUpdate` 帧的 calls / GPU time，不能混成一个平均数。

### 2.1 两类指标必须分开

Node 探针可以稳定度量场景结构，但不能替代浏览器性能验收：

| 层级 | 可度量内容 | 不可据此宣称 |
|---|---|---|
| Node 结构探针 | Mesh/InstancedMesh 数、geometry group、实例数、三角形、材质键、碰撞操作计数 | GPU draw call、GPU 时间、真实帧率、`WEBGL_multi_draw` 支持 |
| 浏览器运行探针 | `renderer.info.render.calls`、RAF p50/p95、主线程耗时、长帧、扩展支持、显存近似量 | 跨硬件的绝对性能结论 |

任何“≤150 draw calls”“稳定 60 fps”结论都必须来自目标 Chromium 的浏览器运行探针。Node 测试只负责确定性回归和阻止结构性退化。

### 2.2 当前结构基线

运行：

```bash
node --experimental-strip-types scripts/perf-probe-draw.mjs
node --experimental-strip-types scripts/perf-probe-draw.mjs --batched
node --experimental-strip-types scripts/perf-probe.mjs
node --experimental-strip-types scripts/perf-probe-lod.mjs
```

2026-08-21 当前 Cedar Crossing 为 166 placements / 26 catalog ids。R0 锁定基线：

| backend | effective color ranges | effective shadow ranges | 合计 | color triangles | shadow triangles |
|---|---:|---:|---:|---:|---:|
| instanced-mesh | **1,414** | **1,001** | **2,415** | **755,614** | **499,418** |
| batched-mesh（multi-draw） | **575** | **276** | **851** | **755,614** | **499,418** |

两条路径的活跃三角形完全相同，这是正确结果：合批压缩提交 range，不自动减少 geometry。Batched 后端相对 Instanced 后端的结构 range 降幅约为 color 59.3%、shadow 72.4%；这些仍是 Node 结构范围，不等同于目标浏览器最终 GPU draw calls。

预算回归使用双向带宽而非只有上限：Instanced color 1,380–1,445 / shadow 975–1,025，Batched color 555–590 / shadow 265–285；两条 backend 的 color triangles 740k–780k、shadow triangles 480k–520k。落地 R3/R8 等主动优化后，应以浏览器与结构证据重新审查并收紧，不得为了继续通过而扩大区间。

### 2.3 浏览器验收协议

Phase 0 固化以下协议：

- 记录浏览器版本、GPU renderer、分辨率和 devicePixelRatio；
- 分别测试“骑行近景”“编辑器全图”“连续拖拽”三个场景；
- 预热 10 秒，采集至少 30 秒；
- 记录 RAF frame time p50/p95、超过 25 ms 的帧比例、`renderer.info.render.calls/triangles`；
- 记录 `WEBGL_multi_draw` 是否可用；
- BatchedMesh 扩容时记录 CPU 峰值与 GPU buffer 近似量；
- 结果分游玩模式和编辑器模式保存，不能用一个预算覆盖两个模式。

---

## 3. 已完成的性能基础设施

### 3.1 `mapLod` 已完成部分

下表是 Phase 1 当时的探针快照，**provisional**：`showcaseMeshCount` 计全部网格（含已被合批隐藏的源），`mapVisibleMeshCount` 才看可见性，因此剥离率混入了 `createOptimizedStaticSceneBatch` 的隐藏，不是纯 mapLod。现行 `scripts/perf-probe-lod.mjs` 对 shopping-mall 输出约 **5016 / 833**，与下表 4743 / 1956 已不一致。R5 落地三阶段指标之前，不要引用本表作回归阈值。

| 模板 | showcase meshes | map-visible meshes | 剥离率 |
|---|---:|---:|---:|
| high-rise-residential | 971 | 387 | 60.1% |
| hospital-campus | 558 | 284 | 49.1% |
| school-campus | 2,020 | 1,557 | 22.9% |
| residential-community | 7,179 | 4,474 | 37.7% |

Phase 1 首轮已通过目录源归一化补齐另外 8 个重模板。规则按 factory 独立审核，只匹配明确的室内家具、微细节和动画小件：

| 模板 | showcase meshes | map-visible meshes | 剥离率 |
|---|---:|---:|---:|
| shopping-mall | 4,743 | 1,956 | 58.8% |
| amusement-park | 3,204 | 2,982 | 6.9% |
| city-center | 2,204 | 2,083 | 5.5% |
| city-park | 2,177 | 2,156 | 1.0% |
| sports-center | 1,831 | 1,830 | 0.1% |
| fire-station | 1,273 | 1,193 | 6.3% |
| office-campus | 625 | 296 | 52.6% |
| residential-building | 243 | 138 | 43.2% |

所有目录中 showcase mesh 数 ≥200 的模板现在都具有非零剥离率。测试同时要求 map-visible mesh 保留至少 25%，防止规则误删整套外观。

### 3.2 碰撞范围查询已完成部分

当前生产路径已经完成：

- 道路 surface/boundary 按 64 m chunk 打包为 collision owner；
- runtime owner 空间哈希为 16 m；
- owner 查询使用 `Uint32Array` visit stamp 去重；
- placement 使用独立 owner，避免把整层退化为一个超大 owner；
- 10×、20×、50×密度测试验证局部查询工作量稳定。

旧 `CitySurfaceIndex` 的全表线性微基准只保留为历史诊断依据，不再代表生产路径，也不再列入后续 Phase。

### 3.3 仍存在的碰撞热路径

- surface boundary 同距离排序仍包含 `JSON.stringify(handle)`；
- owner 内墙段宽相只有在实际 wall segment 数量显著增长时才有收益；
- 当前重模板主要落入 fallback BVH，已测模板的 wall segment 数为 0，因此“墙段宽相”不是近期主线。

后续碰撞优化以**确定性操作计数**为 CI 指标；浏览器 wall-clock 仅作端到端验收，不写成易抖动的单元测试。

---

## 4. 根因与优先级

### P0：`mapLod` 标签未覆盖全部重模板

目录已经声明 `tagged-exterior`，但部分 builder 只写 `userData.zone`，没有把室内、微细节、动画细节映射到 `userData.mapLayer`。这会同时增加 map-visible triangles、visual batches、材质组合和模板碰撞源三角形。

### P0：当前批次作用域无法跨模板

`createVisualBatches(root)` 只处理单个模板，随后又按 256 m 网格拆分 `InstancedMesh`。增大网格会降低对象数却破坏剔除，减小网格会增加对象数；只调格子大小不能解决根因。

### P0：工厂 primitive geometry 完全不复用（原 §9.9 的 P1，本次提升）

`scripts/perf-probe-factory-resources.mjs` 实测当前 33 个可无头构建的 catalog 工厂（`DEFAULT_CATALOG_FACTORY_ADAPTERS` 全量同时构建，含 4/5/6 排标准小区变体与新增工业区；这是**上界**，不是 Cedar / 满图 / 单个 demo 的工作集）：

| 指标 | 实测 | 口径 |
|---|---:|---|
| factory / mesh reference | **33 / 79,294** | adapters 全量同时驻留 |
| distinct geometry 对象合计 | **61,041** | 对象身份去重 |
| 其中可缓存 primitive | **59,108** | 有稳定 `.parameters`，排除对象 path / Lathe / Tube 等 |
| 跨工厂 primitive 参数值键 | **2,653** | 旧理论口径：`type + canonical parameters` |
| 理论可减少 geometry 对象 | **56,455** | 每个值键保留 1 份 |
| 全部 geometry 属性缓冲 | **98.92 MB → 40.21 MB** | 理论减少 58.71 MB；含不可缓存 geometry |
| R3 安全内容键实测 | **61,041 → 4,603** | 实际减少 56,438 个 geometry；安全键为 2,670 个缓存项 |
| R3 实际属性缓冲 | **98.92 MB → 40.23 MB** | 实际减少 58.69 MB |
| distinct 材质对象合计 | **1,080** | 对象身份去重；即使理想全合并也远小于几何对象潜力 |

`perf-probe-factory-resources.mjs` 同时输出旧理论参数键与 R3 安全内容键；`perf-probe-resource-cache-workloads.mjs` 已锁定三组独立工作集：F2 复核后的 Cedar **27,869 → 3,428 / 51.48 → 26.13 MB**，空间 20×（3,320 placements）仍为同一 canonical working set，6 排标准小区 demo **10,337 → 256 / 12.97 → 2.69 MB**。外部 GLB tree 没有 primitive parameters，明确不进入此 cache。

几何侧理论可回收 **56,455 个对象**；即使把 1,080 个材质对象理想化地全部合成 1 个，几何对象潜力仍超过 52 倍。逐工厂看更清楚：

| 工厂 | mesh | geometry 对象 | 唯一 primitive 签名 | 属性字节 → dedup 后 |
|---|---:|---:|---:|---|
| standard-residential-community-6-rows | 13,589 | 10,337 | **188** | 12.97 MB → **2.69 MB** |
| residential-community | 7,224 | 5,938 | **363** | 8.08 MB → **2.86 MB** |
| amusement-park | 3,332 | 3,203 | 492 | 7.83 MB → 3.94 MB |
| shopping-mall | 5,016 | 1,166 | 306 | 4.65 MB → 3.99 MB |

`residential-community` 里单是 `BoxGeometry(0.13 × 1.8 × 0.13)` 就被独立 `new` 了 **608 次**，`BoxGeometry(0.06 × 1.32 × 0.72)` 288 次。同一工厂的材质 intern 只能省 2 个对象（63 → 61）。

primitive geometry **值不可变**，但不能只按 `type + parameters`：工厂可能在构建期旋转/变形 primitive，typed array 类型影响 GPU 解释，`geometry.name` 又参与碰撞角色兜底。R3 因此使用参数 + 最终内容 checksum + attribute 类型/GPU 元数据 + groups/drawRange + 语义名；带非 plain `userData` 的 geometry 拒绝缓存。它**仍然需要所有权与释放基础设施**：只改 `cityTemplateCache.disposeObjectResources` 不够。实施前会直接 `object.geometry.dispose()` 的路径包括：

- 全部 `/demos/*Demo.tsx`（如 `ResidentialCommunityDemo.tsx`、`StandardResidentialCommunityDemo.tsx`、`ShoppingMallDemo.tsx`）
- `ForestScene.ts` 清理 `staticLayer`
- `cityDocumentRenderer.ts`、`cityTemplateCache.ts`
- `CityBatchPerformanceFixture.tsx`、`city-street-furniture/CityFurnitureDemo.tsx`

R3 必须先统一一个全仓库释放入口，所有 map / demo / 测试都查询同一个 `cacheOwned` 注册表。详见 §9.9。

约束：

- cache 只对有 `.parameters` 的 three 内建 primitive 生效；`mergeGeometries` 产物、`LatheGeometry`、`TubeGeometry(path)` 等按对象身份处理（`TubeGeometry` 的 `parameters.path` 是对象引用，字符串化不稳定，必须排除）；
- 共享 geometry 之后，任何 `geometry.applyMatrix4()` / `rotateX()` / `setAttribute()` 都会串台。现有合批路径都是先 `clone()` 再变形，安全；cache 命中的对象必须在开发态断言禁止原地修改；
- 「地图 bake 后释放隐藏源树」**不在 R3**。R11 必须先从 `record.canonicalSource` 产出唯一的高度 1 packed source，再由 owner `heightScale` 承担查询变换；未通过等价性验收的模板继续保留源树。见 §9.9.1。

### P0：BatchedMesh 的目标环境能力未知

Three.js 0.178 的 `BatchedMesh` 依赖 `WEBGL_multi_draw`。扩展不可用时，renderer 会逐 range 回退绘制，因此不能把“一个 BatchedMesh”直接等同于“一次 draw call”。

大规模迁移前必须完成能力 spike，并保留：

- `BatchedMesh` 后端：目标环境支持且实测获益；
- `InstancedMesh` 后端：按共享 geometry/material 合理合批的兼容回退；
- 特殊对象后端：透明物、动态相位对象、无法稳定映射 LOD slot 的对象。

### P1：阴影在骑行时近似每帧全量刷新

当前 `driveMode` 因 rider pose 每帧变化而不断刷新阴影。140 m 投影视口配 1024 阴影贴图时，一个 texel 约 0.137 m，单纯 texel snapping 仍会频繁刷新。

正确方向见 §9.3：**选定骑手 blob / contact shadow**。静态城市阴影使用数米级 dead zone，越界后才重新居中并做 texel snapping。不要上双 DirectionalLight。

### P1：编辑器更新仍以整层重建为主

placement 修改仍会触发 placement 层同步重建和碰撞全量替换。2,000–2,500 placements 下，需要显式设计 add/update/remove staging、原子提交、回滚、道路依赖 closure 和 document generation 一致性，而不能简单声称“插入 owner 即 O(1)”。

---

## 5. 目标架构

```text
模板 builder
   │
   ▼
CityTemplateCache
   │  geometry + materialBatchKey + layout + shadow policy
   ▼
CityBatchWorld（混合后端）
   ├─ BatchedMesh backend（能力验证通过时）
   ├─ InstancedMesh backend（兼容回退）
   └─ special backend（透明 / 动态相位 / 特殊 shader）
   │
   ▼
CityVisibilitySet
   │  placement AABB / part subgroup / near-far state / shadow state
   ▼
PlayPolicy | EditorPolicy
```

### 5.1 材质规范化

现有 `materialBatchKey()` 已按材质值生成兼容键，因此“材质对象数”不代表“不可合批材质数”。Phase 2 探针已测得 24 个可无头构建的目录模板：

| 指标 | 实测 |
|---|---:|
| 模板内 visual batches | 574 |
| 唯一材质值键 | 335 |
| 完整 batch compatibility keys | 367 |
| 忽略 diffuse color、改用 instance tint 后的材质族 | 162 |
| 忽略 diffuse color 后的 compatibility keys | 191 |

这证明“全面 palette 后自然降到 ≤40 材质”没有依据；单纯把等值材质对象 intern 也不足以达到最终 draw-call 目标。后续应优先验证“白色基础材质 + per-instance diffuse tint”的选择性归并，同时保留 emissive、透明、贴图、roughness、shadow policy 和 layout 边界。

#### 5.1.1 材质对象规模实测（2026-08-20 审查）

2026-08-20 的 30 工厂历史样本：

| 指标 | 实测 |
|---|---:|
| 材质对象总数 | 1,022 |
| 跨工厂唯一材质值键 | 455 |
| **intern 上限收益** | **−567 个 JS 对象** |
| 带贴图的材质 | **0** |
| `MeshPhysicalMaterial` 对象（30 adapter 全量构建，按身份） | **12** |
| `MeshPhysicalMaterial` 源码构造点 | ≥4（见下） |

2026-08-21 的 33 工厂资源探针已把材质对象总数更新为 **1,080**；455/−567 仍只代表上表历史样本，不能直接与不同工厂集合比较。Palette F1 已抽出共用安全 encoder，R5 的 32 个 factory 三阶段探针已使用该唯一口径；其中“material key”是逐模板计数后求和，不是假装跨模板共享对象的全局唯一数。

城市工厂源码构造点至少 4 处：shopping-mall `curtainGlass`、amusement-park `ferrisCabinGlass`、luxury-villa `water`、residential-gate-premium `glass`。其余对象来自 4/5/6 排标准小区变体各自 mint 一份，以及可能的嵌套。列名必须区分「对象数」与「构造点 / 值族」，禁止再写「6」而不加口径。

单工厂 intern 收益极小：`residential-community` 63 → 61，`fire-station` 36 → 32，`standard-residential-community` 82 → 70。多数工厂材质对象数与值键数相等，工厂内 intern 收益为 0。

对照当前 P0 的 61,041 个 geometry 对象，材质仍不是内存或对象数的主要矛盾。

#### 5.1.2 Palette 定级：P2

工厂层 Palette 见 `docs/superpowers/specs/2026-08-20-city-material-palette-design.md`。基于上述实测，本稿把它从「P0-dispose + A~G」降为 **P2**，并且**不再以「减少材质对象」作为立项理由**（历史 30 工厂样本只省 567 个）。

保留 Palette 的理由只剩两条，且都不紧急：

1. 补齐 `materialBatchKey` 对 `MeshPhysicalMaterial` 的字段覆盖——按对象身份影响 12 个材质，但会造成错误合池，值得单独修；详见 Palette 稿 §4。
2. 为将来的 instance tint 归并提供稳定的「可变 / 不可变」语义。

**明确不成立的原有理由**：所有工厂材质都是 build 函数内的局部变量（例如 `fireStation.ts:93` 的 `const glass = new THREE.MeshStandardMaterial(...)`），全仓库**零个模块级材质**。因此地图 bake 的 `STATIC_FALSE_HOOKS` → `setPowered(false)` 与展示区之间当前**物理隔离**，不存在共享污染。只有引入进程级 intern 表之后才会出现该风险，也才需要 WeakSet 所有权、dispose 跳过、clone 判定这一整套基础设施。

#### 5.1.3 从 Palette 拆出的独立 P1：静态合批的材质别名

`sceneInstanceBatch.ts:220-226` 对**所有** candidate 执行 `object.material = canonical`，包括最终 `batch.meshes.length < 2`、根本没有被合并的网格。按值别名的作用域因此**大于**合批作用域，且已在线上运行。

后果：嵌套子模型（路灯、餐车、闸门透镜）的可变材质如果没有冒泡到外层 `mutableMaterials` 白名单，就会与等值的静态材质合并成同一对象，夜景 hook 改一处会点亮另一处。这是**当前存在的缺陷**，不依赖 Palette。完整修法见 Palette 稿 §3：

- pending key 用值键（或显式 `cityMutableMaterial` 的 identity 键），**不要**用 uuid 分桶；
- source mesh 保持原材质引用；
- 只有 proxy 使用 canonical material。

不要声称能「自动识别 hook 闭包引用的材质」——JS 闭包不可反射。`cityMutableMaterial` 是显式标记。

白底 + instance tint 仅地图 ingestion 使用，且必须保留 slot `baseTint`，高亮不得把 `setPlacementTint(null)` 写成白色。不要 `Object.freeze(THREE.Material)`。

### 5.2 `CityBatchWorld`

```ts
interface CityBatchWorld {
  addPlacement(placementId: string, templateId: string, transform: Matrix4Snapshot): void;
  movePlacement(placementId: string, transform: Matrix4Snapshot): void;
  removePlacement(placementId: string): void;
  setPlacementVisible(placementId: string, visible: boolean): void;
  setPlacementLod(placementId: string, tier: "near" | "far"): void;
  setPlacementTint(placementId: string, tint: THREE.Color | null): void;
  resolvePick(hit: CityBatchPick): string | null;
  commit(): void;
  stats(): CityBatchStats;
}
```

实现约束：

- 映射是 `placementId ↔ instanceId[]`，一次 placement tint/move 需要更新其全部 part instances；
- 外部可见集生效时，BatchedMesh 必须设置 `perObjectFrustumCulled = false`、`sortObjects = false`；
- `deleteInstance()` 的 id 由 freelist 复用；`optimize()` 只整理 geometry range，不能用于压缩 instance id；
- 2,500 placements 按当前约 12 parts/placement 估算约 30k instances，矩阵数据约 1.9 MB，而非 160 KB；
- BatchedMesh 会复制 geometry 到合并缓冲，必须记录常驻与扩容峰值。

### 5.3 LOD slot

`setGeometryIdAt()` 只能切换同一材质/属性布局内的 geometry，不能自动解决 near 模型十几个部件与 far 模型一两个部件之间的拓扑差异。

v1 采用稳定 near-slot 数：1–3 个兼容 slot 持有 far 体块，其余 slot 在 far 档进入 `hidden-in-far`。`hidden-in-far` 最终用 `setVisibleAt(false)` 表达，但任何调用方都不能直接覆盖这个 bit；所有写入必须经过 §9.4 的 authored/render-set/LOD-slot 三状态合成。不采用 near/far 双实例集（那会翻倍 instance 数）。

Far LOD 外壳目前不是现成资产。它属于性能衍生资产，需要单独定义生成方法与视觉验收；不能把它算进“只加标签、不改视觉”的 mapLod 工作。

### 5.4 红绿灯

geometryId 不能改变材质，`setColorAt()` 也不能完整表达现有 emissive/material/visibility 相位。因此生产实现不在同一 geometry instance 上切 phase，而是把 red/green 导出为两个稳定 template id，各自使用不可变的 phase 专用材质池。单材质、不透明相位槽进入独立 `CityBatchWorld`，透明或多材质槽仍走特殊 attachment 回退。相位变化重建信号层，不跨材质调用 `setGeometryIdAt()`。

### 5.5 可见性索引

视觉分块尺寸独立测量，不因为碰撞使用 64 m 就直接复用 64 m。大型模板可能跨越多个分块，必须以 placement AABB 求交并聚合多个分块状态，不能仅按 placement 中心决定可见性。

若大型园区只露出一角仍导致整套模板提交，则进一步把模板拆成空间 part subgroup；这项按浏览器数据决定，不在 v1 预先复杂化。

Phase 4 首轮实测后采用更简单的直接 AABB 视锥扫描：template slots 的 near/far geometry 先合并为保守 local AABB；由于颜色与阴影当前共享一个 visibility bit，投影到 X/Z 的边界按固定城市太阳约 0.74 的水平/垂直光线比例扩张为 `0.8 × templateHeight + 12 m`，避免视口外高层的阴影提前消失。placement transform 生成 world AABB，每帧更新 BatchedMesh instance visibility。2,340 placements 时扫描仍远低于 1 ms，因此当前不增加视觉分块索引。只有空间分布式 fixture 或更大地图把扫描成本推高后，才按上述多 chunk AABB 方案升级。

### 5.6 拾取

`BatchedMesh.raycast()` 会遍历全部 active + visible instance，API 不接受“仅检测某批 instance id”的白名单。生产选型见 §9.6：placement AABB 宽相 + 候选 instance 精确 raycast。

### 5.7 道路

碰撞道路继续按 64 m chunk，不与视觉对象边界绑定。生产视觉实现按 `surfaceProfileId + material + shadow policy` 合并整张文档的道路表面：asphalt、bike-lane、driveway 各成为单材质 mesh，sidewalk 把所有 top indices 与 curb indices 分段重排后保留两个 material group。道路标线、箭头、斑马线原本已经按全图聚合，继续保持独立 mesh。后续只有在编辑器文档更新峰值或超大地图可见性数据证明需要时，才把整图合并改为测量后的视觉 chunk。

---

## 6. 分阶段实施计划

阶段 0A–5 的第一轮已完成（见 §8）。下表保留原始规划作为历史，实际剩余工作以 §6.2 的重排为准。

| 阶段 | 内容 | 验收 |
|---|---|---|
| **0A** | 重建当前 Node 基线；固定 1×/10×/20× fixture；记录 wall/fallback 比例 | 确定性测试通过，基线与当前代码一致 |
| **0B** | 目标 Chromium BatchedMesh spike：扩展、draw calls、阴影、raycast、LOD slot、phase、resize；设计回退 | 明确 go/no-go 与后端选择，保存浏览器测量结果 |
| **1** | 补齐剩余重模板 `mapLod` 标签 | 被审核模板剥离率 >0；视觉边界不破损；三角形和碰撞源下降 |
| **2** | 统计真实 batch compatibility key；中央材质 canonicalization | 材质兼容组合显著收敛，参数与视觉不变 |
| **3** | 混合 `CityBatchWorld`；先迁移不透明静态部件，保留兼容回退 | 浏览器颜色 calls 达阶段预算；20× 不随 placement 线性增长 |
| **4** | AABB 可见集、near/far LOD、静态阴影 dead zone、独立阴影状态 | 游玩与编辑器预算分别通过；骑行不再每帧刷新静态城市阴影 |
| **5** | 道路渲染按 profile/material 合并；移除剩余热路径字符串/分配 | 道路 calls 显著下降；碰撞操作计数不退化 |
| **6** | 墙段宽相（仅 wall 指标触发时）或 fallback BVH 定向优化 | 20× 局部碰撞工作量保持有界 |
| **7** | 编辑器增量 add/update/remove、原子 collision staging、拾取、逆操作撤销 | 单 placement 编辑不整层重建；拖拽和撤销行为正确 |

### 6.1 阶段预算

最终目标仍为 2,000–2,500 placements，但预算必须绑定参考环境：

| 场景 | 目标 |
|---|---|
| 骑行近景 | RAF p95 ≤16.7 ms 为优先目标；普通颜色 calls P95 ≤150；shadow-refresh 帧的阴影 calls P95 ≤60；不得靠可见硬裁剪达标 |
| 编辑器全图 | 保持交互流畅；允许高于骑行 calls，但必须强制远 LOD |
| 连续拖拽 | 单次 placement 更新不触发全 placement 层或全 collision world 重建 |

60 fps 是参考机器上的验收目标，不作为所有设备的无条件承诺。

### 6.2 剩余工作重排（2026-08-20 审查后）

| 序 | 内容 | 依据 | 验收 |
|---|---|---|---|
| **R0（已完成）** | 度量重锁：共享 `effectiveRenderRangeCount` / `effectiveTriangleCount`；预算测试按两条 backend 参数化；工厂资源探针 | §2.0 | 双 backend 带宽、私有字段 fail-fast、drawRange/可见性边界与 33 工厂资源表已通过 |
| **R1（已完成）** | 三类 helper source-authority、共用 `isCollisionSourceEligible()`、catalog `optimizeStatic` 测试开关与自动 factory 探针 | §9.1、§9.2 | 自动发现 17 个 factory；solid/surface pre/post byte-exact，代表性圆扫掠 TOI/法线一致 |
| **R2（实现完成；已建立目标 GPU 基线）** | pool `frustumCulled=false`；把与真实缓存 shadow map 一致的冻结 `shadowFrustum` 并入可见性判据 | §9.10、§9.11 | 原子 shadow-rig 快照、普通帧冻结、真实 AABB color/shadow union、authored hide 均有测试；目标 GPU 路线截图已人工检查，后续同 pose 才能做差分 |
| **R3（已完成）** | primitive geometry cache + **全仓库统一释放入口** `cacheOwned` + generation/lease retirement | §4 P0、§9.9 | F2 后 Cedar 27,869→3,428；空间 20× 同 working set；6 排 demo 10,337→256；共享卸载/HMR/mutator/checksum/异常清理均通过 |
| **R4（已完成）** | 15/15 展示区接入 `createShowcaseRenderBudget`；最重三个补光池和阴影策略；统一 `continuous` 活动合同 | §9.12 | 静态休眠/阴影节流单测；源码覆盖守护；最重场景 Chromium 证实 idle=0 draw 且 shatter 能唤醒并完成 |
| **R5（已完成）** | mapLod 三阶段指标（`optimizeStatic: false/true`）+ 共用安全材质键 + 逐模板精确基线（已移除 `\|\|` 逃生门） | §9.2、§9.13 | 32 个 factory 三阶段精确基线；8 个重模板严格下降；碰撞不变量通过 |
| **R6（已完成）** | 阴影拆分：**骑手 shader contact shadow**（方案 B）。静态 DirectionalLight 不含骑手，dead zone=4 m | §9.3 | 结构测试覆盖坡面/渐隐/材质合同；Cedar Chromium 骑行稳态静态刷新=0 |
| **R7（已完成）** | 5×4 空间分布 20× fixture：完整道路/信号引用复制、确定性路线、bounds 自动 fit、1920×1080/DPR=1 合同 | §9.7–9.8 | Node/Chromium 结构门及 headed Apple GPU 10s+30s 完整采样通过；性能判定转交 R12 |
| **R8（代码门完成；视觉基线已建立）** | placement/fallback AABB + canonical near 精确 raycast；33/33 模板 massing proxy；三状态可见性；instance `baseTint` | §9.4–9.6 | 状态矩阵/拾取/tint 单测及 Cedar/20× Chromium 通过；目标 GPU massing/近景截图人工检查通过，后续变更做同 pose 差分 |
| **R9（P2 延后）** | 完整材质 Palette intern；F1/F2 已解决当前正确性问题，现有样本最多只省 567 个 JS 对象 | §5.1.2 | 不进入当前性能主线；只有新增明确内存证据或 tint 所有权需求时重启 |
| **R10（已完成）** | 编辑器增量 add/update/remove（原阶段 7） | §4 P1、§9.14 | 单 placement 视觉只触及对应 cell；碰撞旧代在线 staging，新代仅更新变化 owner/16 m bucket；Chromium 门通过 |
| **R11（已完成）** | 地图 bake 后释放隐藏源树 | §9.9.1 | 高度 1 immutable payload + owner `heightScale` 查询变换；四高度全路径等价后按模板释放，cache miss/后续编辑不再访问源树 |
| **R12（已完成）** | 连续远景提交归因；移除地图 transmission prepass；instance tint + PBR 分档合池；512m 特殊 fallback 分桶 | §9.8 | 3,200m far plane 保持；Apple M5 Pro 20× 骑行 RAF P95 9.0ms、普通颜色 calls P95 148、shadow-refresh calls P95 44；截图通过 |

并行性说明：

- R0 必须最先完成，后续所有结构验收都依赖它；
- R2 的 `frustumCulled=false` 与 R0/R1 无依赖，可以立即插队；`shadowFrustum` 部分必须与 R6 的冻结 shadow-rig 状态合同对齐，但不要求先实现 blob；
- Palette 稿的 F1（共用安全 encoder + physical 键补全）可与 R0 并行；F2（合批材质别名作用域 + 八个真实工厂标记审计）紧随 F1，不能只改合批器后把生产标记留到 P2；
- R3 的 `cacheOwned` 是 Palette R9 的前置。不要为材质单独再建一套释放入口；
- R11 不得并进 R3。必须先完成高度 1 canonical pack、runtime `heightScale` 变换与按高度 bake 的等价性验收；未通过的模板继续保留 `canonicalSource`，不能靠释放后临时重建 factory 兜底。

---

## 7. 风险与回退

| 风险 | 缓解 |
|---|---|
| `WEBGL_multi_draw` 不可用 | 使用 InstancedMesh/特殊对象混合回退；不启动全量 BatchedMesh 迁移 |
| BatchedMesh CPU 逐实例遍历 | 关闭内建 per-object culling/sort，由外部可见集驱动 |
| near/far 部件数与材质拓扑不同 | 稳定 LOD slot + `proxy` / `hidden-in-far` / `keep-near` 策略；最终 visible 只能由三状态合成入口写入，不采用双实例集 |
| 透明材质排序 | 保持独立小批次，不与不透明世界强合并 |
| color 与 shadow 可见集不同 | 独立 shadow batches 或正式的 per-instance shadow eligibility 设计 |
| 大型园区跨 chunk | placement AABB 多 chunk 聚合，必要时模板内空间 subgroup |
| 误删外观/碰撞 | 每模板审核、剥离上下界、碰撞预算与浏览器截图回归 |
| 编辑器增量状态不原子 | staging + generation 检查 + commit/rollback；道路依赖按 dirty closure 更新 |

---

## 8. 当前实施状态

| 项目 | 状态 |
|---|---|
| 64 m 道路 collision owner chunk | 已完成 |
| 16 m runtime owner spatial index | 已完成 |
| owner visit stamp 去重 | 已完成 |
| placement 独立 legacy owner | 已完成 |
| 1×/10×/20×/50×局部碰撞密度回归 | 已完成 |
| high-rise / hospital / school / residential-community mapLod | 已完成 |
| 当前 Node draw/LOD 探针 | **R0 已修复**：共享结构指标，Instanced/Batched 双 backend 带宽，真实 active triangles 与 drawRange/可见性守护（§2.0） |
| batch compatibility key 探针 | 已完成：335 个材质值键 / 367 个完整兼容键；tint 路径潜力为 162 / 191 |
| 浏览器 runtime 能力/帧时探针 | 已完成：暴露 GPU、WebGL、multi-draw、backend、p50/p95、长帧比例 |
| Chromium 端到端探针回归 | 已完成：Cedar 场景与新增性能字段通过 |
| 目标实体 GPU 的 BatchedMesh go/no-go | 已完成：Apple M5 Pro / ANGLE Metal 支持 multi-draw，spike 通过 |
| 剩余 8 个重模板 mapLod | Phase 1 首轮已完成 |
| CityBatchWorld | 已接入 catalog 不透明静态槽与 red/green 交通灯相位槽；透明/多材质保留特殊路径 |
| InstancedMesh fallback | 已完成：multi-draw 不可用时保持原 template × cell 渲染路径 |
| 交通灯 phase batch | 已完成：red/green 独立 template/material pool，特殊槽回退 |
| 道路视觉合并 | 已完成：按 surface profile 合并，sidewalk 保留 top/curb 两组材质 |
| 稳态浏览器采样 | 已完成：可重置采样窗口，编辑态与骑行态分别采集 180+ 帧 |
| 1×/10×/20×生产路径压力 fixture | **R7 已替换**：166-placement Cedar 按 5×4 空间平铺，20× 为 3,320 placements / 1,100 roads；旧重叠 fixture 只保留历史数据 |
| BatchedMesh 容量/缓冲统计 | 已完成：instance/vertex/index capacity 与自有 buffer bytes 近似值 |
| AABB 视锥可见集 | **R2 已实现**：真实 placement AABB 与 color/frozen-shadow frustum 做 union，再与 authored visibility 合成（§9.11） |
| 阴影拆分 | **R6 已完成**：骑手 shader contact shadow；静态城市 shadow refresh 与骑手姿态解耦（§9.3） |
| BatchedMesh pool 包围球失效 | **已修复**：pool `frustumCulled=false`，外部 AABB 可见集保持唯一剔除权威（§9.10） |
| 碰撞 / render-proxy source authority | **已完成**：三类 helper 统一标记，solid/surface packer 共用祖先链筛选；17 factory 的 pre/post pack 与圆扫掠等价（§9.1） |
| 展示区渲染预算 | **R4 已完成**：15/15 个 demo 接入；最重三个同时接入 light pool + shadow policy；continuous 合同与 Chromium idle/wake 回归已锁定（§9.12） |
| primitive geometry cache | **R3 已完成**：安全内容键、强引用 generation、显式 lease、统一释放入口、demo/ForestScene/renderer/template 接入及三组工作集回归（§4、§9.9） |
| 地图 bake 后释放源树 | **R11 已完成**：两类 canonical payload 编译成功后按模板释放，后续 owner 编辑复用 payload（§9.9.1） |
| 材质 Palette | **降级为 P2**，立项理由重写（§5.1.2） |
| 静态合批材质别名 | **Palette F2 已完成**：canonical 只写 proxy；hook 可变源显式标记，八工厂 identity/状态差分通过（§5.1.3） |
| 编辑器增量提交 | **R10 已完成**：视觉 cell/Batched 原位更新，碰撞内容缓存 + owner/16 m bucket 增量 staging（§9.14） |

### 8.1 2026-08-19 首轮实施结果

- Cedar 结构估算：3,457 → **3,354** ranges（下降 3.0%）；
- triangles：约 0.42 M → **0.35 M**（下降约 17%）；
- `shopping-mall` map draw ranges：97 → **58**；
- `office-campus` map draw ranges：17 → **13**；
- `residential-building` map draw ranges：13 → **11**；
- 全量构建与当前 **448 个 Node 测试**通过；
- Cedar Chromium 端到端回归通过。

### 8.2 BatchedMesh go/no-go 结果

隔离 fixture：`/performance-fixture`，包含 3 种 geometry、96 个 live instances、实例颜色、显隐、near/far geometry 切换、raycast、64→128 instance capacity 扩容和 geometry buffer resize。

| 环境 | WebGL | `WEBGL_multi_draw` | 颜色 calls | 阴影 calls | 结论 |
|---|---:|---|---:|---:|---|
| Playwright headless / SwiftShader | 2 | 支持 | 2 | 1 | API 与回退判定通过，不作为硬件性能结论 |
| Headed Chromium / Apple M5 Pro / ANGLE Metal | 2 | 支持 | 2 | 1 | **BatchedMesh backend go** |

两种环境下 capacity expansion、geometry resize、LOD switch、instance tint、visibility、raycast 和 draw-call compression 全部通过。该结论只批准“不透明静态对象”的 BatchedMesh 后端；透明排序、红绿灯相位、独立 shadow visibility 和全局拾取宽相仍按特殊路径处理。

### 8.3 `CityBatchWorld` 正式接入

已实现 BatchedMesh world，并接入 `CityDocumentRenderer` 的 catalog placement 路径，具备：

- template slot 与 material/layout pool 注册；
- placement 增删、移动、显隐、LOD、tint；
- `placementId ↔ batchId` 拾取映射；
- instance capacity 倍增与 geometry buffer 扩容；
- `deleteInstance` 后 id 复用时重新绑定 placement；
- 外部可见性模式：`frustumCulled=false`、`perObjectFrustumCulled=false`、`sortObjects=false`；
- source material 借用语义，world dispose 不销毁上游材质。

`CityTemplateCache` 现在明确分流：catalog 的单材质、完全不透明静态 batch 导出为稳定 template slots；交通灯按 red/green phase 分别导出稳定 template slots；透明和多材质槽继续通过原有 attachment 路径。`CityVisualLayerManager` 同时支持 `instanceId` 和 `batchId` 拾取映射。若运行环境不支持 multi-draw，renderer 选择原 InstancedMesh 路径，不创建 BatchedMesh world。

### 8.4 正式 Cedar 验证

2026-08-21 R0 共享口径的 Node 场景结构估算（166 placements）：

| 路径 | 颜色 ranges | 阴影 ranges | 合计 | color / shadow triangles |
|---|---:|---:|---:|---:|
| InstancedMesh 回退路径 | **1,414** | **1,001** | **2,415** | **755,614 / 499,418** |
| BatchedMesh multi-draw + 特殊 fallback | **575** | **276** | **851** | **755,614 / 499,418** |

旧表的「0.35 → 0.29 → 0.28 M」来自读取 BatchedMesh 合并缓冲容量且不乘实例数，已经删除，不能再作为优化收益。当前两条 backend 的 triangles 完全相同；Batched 的已证收益是 range 压缩。

下面是 R7 正式协议前的短窗口历史基线，来自 headed Chromium / Apple M5 Pro / ANGLE Metal；编辑态与骑行态分别采集 180+ 个连续 RAF 样本。浏览器 `renderer.info` 是 Three.js 在真实 renderer 提交路径上的计数，不是“直接从驱动读取”。当时尚未接 GPU timer；现行 10s+30s 分栏数据以 §9.8 为准：

| 指标 | 编辑态稳态（180 帧） | 骑行态稳态（182 帧） |
|---|---:|---:|
| `renderer.info.render.calls` | **140** | **137** |
| `renderer.info.render.triangles` | **619,632** | **612,708** |
| frame time p50 | **8.3 ms** | **8.3 ms** |
| frame time p95 | **9.3 ms** | **9.0 ms** |
| >25 ms frame ratio | **0%** | **0%** |

短窗口旧数据（246 calls、p95 58.8 ms）包含场景加载、shader warm-up 与碰撞编译，不能代表稳态；现已由可重置窗口替代。参考机器上两种模式均通过当前 RAF p95 ≤16.7 ms 的阶段目标。此结论只适用于该硬件、该视角和当前 117 placements，不外推为所有设备或 2,500 placements 的保证。

本节之后的 10×/20× 验证与 AABB 可见集已经在 8.5 完成。结果表明当前增长项是 active triangles，而不是 pool calls 或 batch buffer；因此 material tint 归并继续延后，也不对已经有界的碰撞范围查询更换架构。

### 8.5 1×/10×/20× 压力验证与 AABB 可见集

压力 fixture 复制 Cedar placement id，但保持相同 authored transform、道路、交通灯、相机覆盖和材质兼容关系。它用于隔离 placement 数量、批池扩容、碰撞编译与 GPU 提交增长；复制品故意重叠，不是可由编辑器保存的合法城市，也不能替代空间分布式大地图验证。

AABB 可见集接入前：

| 规模 | placements | calls | triangles | p95 | batch buffer 近似 |
|---|---:|---:|---:|---:|---:|
| 1× | 117 | 140 | 0.62 M | 9.3 ms | 19.77 MB |
| 10× | 1,170 | 140 | 3.67 M | 10.3 ms | 20.69 MB |
| 20× | 2,340 | 140 | 7.07 M | 14.3 ms | 21.90 MB |

calls 与 geometry capacity 保持不变，batch 自有缓冲只增长约 2.1 MB；实际增长项是 active instance triangles。因此不先做 material tint pool 归并，而先做 AABB 可见集。

AABB 可见集接入后，同一 Apple M5 Pro / ANGLE Metal 环境：

| 规模 | calls | triangles | 可见 placements / instances | 视锥扫描 avg / max | p95 |
|---|---:|---:|---:|---:|---:|
| 1× | 117 | 0.34 M | 15 / 118 | 0.028 / 0.20 ms | 10.1 ms |
| 10× | 117 | 0.98 M | 132 / 1,054 | 0.087 / 0.20 ms | 10.0 ms |
| 20× | 117 | 1.69 M | 262 / 2,094 | 0.093 / 0.20 ms | 10.1 ms |

20× triangles 相比接入前下降约 **76%**，p95 从 **14.3 ms** 降到 **10.1 ms**，长帧比例保持 0%。常规 Cedar 编辑态为 117 calls / 0.34 M triangles / p95 10.0 ms；骑行态为 133 calls / 0.35 M triangles / p95 10.0 ms。透明和多材质 fallback 尚未进入该可见集，因此骑行 calls 仍高于编辑态。表中采用最终的保守阴影扩张；更激进的固定 12 m margin 虽可降至 100 calls / 1.57 M triangles，但不能充分覆盖高层投影阴影，未作为生产配置保留。

`estimatedBufferBytes` 只计算 BatchedMesh 自有 geometry capacity、矩阵以及 visibility/id/color 近似存储，不包含 source templates、材质、纹理、shadow map 和驱动开销。`performance.memory` 受 GC、开发运行时和浏览器实现影响，本轮只记录，不作为回归阈值。

---

## 9. 发布前仍须闭合的缺口

审查（2026-08-20）确认下列项在满图前不能再标成「下一步可选」。

### 9.1 P0 — 碰撞与渲染可见性分离

静态合批把源网格 `visible=false`，代理 `mapCollisionRole: "ignore"`，打包器只收 effectively-visible 网格。抽样丢失的本应碰撞三角形：shopping-mall ~19204、fire-station ~14552、city-center ~23180、school-campus ~13748。

复核（2026-08-20 r4）确认属实，而且影响面**不止原先八个工厂**：

| 现状 | 位置 | 后果 |
|---|---|---|
| 合批把源网格 `visible = false` 并写 `userData.renderProxySource` | `sceneInstanceBatch.ts:284-289` | — |
| 打包器收集条件只有 `isEffectivelyVisible(object, root)` | `cityTemplateCollisionSource.ts:404`、`:245` | 隐藏源直接被跳过 |
| 代理 `mapCollisionRole: "ignore"` | `sceneInstanceBatch.ts:282` | 可见几何也不进 solid/surface |
| `createInstancedPrototypeBatch` 隐藏 placement root，但不写 `renderProxySource` | `sceneInstanceBatch.ts:386-490` | 标准社区、豪宅、完整社区的重复建筑/车辆/家具仍被跳过 |
| `createMergedStaticBatch` 隐藏 source root，但不写 `renderProxySource` | `sceneInstanceBatch.ts:495-562` | 围墙、桥、庭院、球场等静态碰撞仍被跳过 |
| 展示区测试用 `renderProxySource` 把隐藏源算「仍在」 | `town-center.test.mjs:15` 等三处 | 碰撞打包没有对应例外 |

直接构建真实 factory、排除 `renderProxy === true` 代理后，使用 catalog 的 `resolveMapCollisionRole` 审计：

| 工厂 | effectively-hidden 且 role ≠ ignore 的 mesh | 三角形 | mesh 自身 `renderProxySource` |
|---|---:|---:|---:|
| standard-residential-community | 6,596 | 99,160 | 0 |
| standard-residential-community-6-rows | 12,656 | 190,576 | 0 |
| luxury-villa-community | 2,863 | 39,128 | 0 |
| residential-community | 3,748 | 49,096 | 0 |

这些数字是保守的 source-authority 审计，不作为最终 collision pack 基线；它们证明「只给 `createOptimizedStaticSceneBatch` 增加读取例外」无法闭合 R1。

八个调用 `createOptimizedStaticSceneBatch` 的工厂（amusement-park、school-campus、shopping-mall、fire-station、city-park、sports-center、city-center、town-center）全部注册在 catalog 中，且合批发生在工厂函数内部、早于 catalog 交接，没有任何开关能在地图构建时跳过。

此外，standard-residential-community（3/4/5/6 rows）、luxury-villa-community、residential-community 已在工厂内部调用另外两类 helper。R1 的范围是**所有三类 helper 及其 catalog 消费者**，不得再固定为八个工厂。

**合同：**

- 渲染用可见性（`visible`、mapLod 隐藏室内）只影响提交；
- 碰撞权威是 `mapCollisionRole` + 未剥室内的源网格。三类 helper 都必须给隐藏源写统一的 `userData.renderProxySource`：optimized helper 写到被合并的 mesh；prototype/merged helper 写到每个被隐藏的 placement/source root。带该标记的对象或其后代**必须**进入 `packTemplateCollisionSource` / `packTemplateSurfaceCollisionSources`；
- 代理网格保持 `ignore`，避免 solid 双计；
- mapLod 隐藏的 `interior` / `micro-detail` / `animated-detail` 仍不进碰撞（这是 LOD 合同，不是合批合同）。

**不得写成 `visible || renderProxySource`，也不得只读取 mesh 自身或最近的 `mapLayer`。** 工厂先合批、catalog 再 `applyMapLod`。室内网格可能既位于带 `renderProxySource` 的 source root 下，又位于隐藏 layer 下。`applyMapLod` 的语义是祖先链任一隐藏 layer 都使子树不可见；子节点的 `exterior` 不能覆盖祖先的 `interior`。两个 packer 必须共用：

```ts
function isCollisionSourceEligible(
  object: THREE.Object3D,
  root: THREE.Object3D,
  hiddenLayers: ReadonlySet<string>,
): boolean {
  if (!(object instanceof THREE.Mesh)) return false;
  let renderProxySource = false;
  let reachedRoot = false;
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (node.userData.renderProxy === true) return false;
    const mapLayer = node.userData.mapLayer;
    if (typeof mapLayer === "string" && hiddenLayers.has(mapLayer)) return false;
    if (typeof node.userData.renderProxySource === "string") renderProxySource = true;
    if (node === root) {
      reachedRoot = true;
      break;
    }
  }
  if (!reachedRoot) return false;
  return renderProxySource || isEffectivelyVisible(object, root);
}
```

**合批前后对比怎么采：** 工厂在 `return` 之前已经调用合批 helper，外部拿不到真正的 pre-batch 场景。三类 helper 必须采用同一种可测试机制，二选一（可同时做）：

1. 工厂接受测试专用 `{ optimizeStatic?: boolean }`（默认 `true`）；测试各建一次开/关；
2. 合批器返回 `{ layer, snapshot: { pre, post } }`，含 mesh / triangle / material key 计数。碰撞三角形仍用 (1) 各 pack 一次，因为那是权威。

**验收（真实 factory，不是手工 fixture）：**

对上述八个 optimized 工厂、standard-residential-community 的 3/4/5/6 rows、luxury-villa-community、residential-community、三个 modern-industrial 工厂，以及后续每一个走任一 render-proxy helper 的工厂：

1. 合批前 / 合批后 packed solid 三角形、rideable 三角形；
2. 至少一条穿过建筑轮廓的圆扫掠（命中距离与法线）合批前后一致；
3. 隐藏源且 role ≠ ignore 的三角形数公开记账，合批后不得丢失。
4. 自动守护：三类 helper 每个被隐藏 source root/mesh 都带 `renderProxySource`；代理 mesh 自身或最近的代理层祖先带 `renderProxy`；禁止只靠人工维护 factory 名单。

**2026-08-21 r4.5 实施状态（已闭合）：**

- 三类 helper 的隐藏源标记已统一：optimized 写 mesh，prototype/merged 写 placement/source root；对应 helper 自动守护已加入 `scene-instance-performance.test.mjs`；
- solid/surface 两个 packer 已共用上述 production `isCollisionSourceEligible()`；测试覆盖代理祖先、隐藏 LOD 祖先、detached mesh、隐藏 source 恢复及 solid/surface 只打包一次；
- catalog source 与全部 helper consumer 已接入 `optimizeStatic`（默认 `true`）；探针不维护固定 factory 白名单，而是从 catalog 自动发现 `optimizationEnabled` 的生产 source，因而补抓到原清单漏掉的 technology-park、food-processing-plant、mechanized-factory，当前实际范围是 **17** 个；
- `scripts/perf-probe-collision-authority.mjs` 按 production registry、静态 hook、mapScale 与 mapLod 顺序各构建一份 pre/post。旧 visible-only 口径为 87,122 solid / 9,178 rideable source triangles；新权威口径为 999,384 / 19,662，恢复 **912,262 solid / 10,484 rideable**、57,345 个 source mesh；最终 pack 为 998,184 solid 与 18,362 surface triangles（退化面过滤与 64 m surface clipping 使 packed 数不应直接等于 source 数）；
- 17 个 factory 的 solid 与 surface packed typed arrays 均 byte-exact；每个 factory 都编译 pre/post source，并沿场景包围盒搜索至少一条真实命中的横向/纵向圆扫掠，TOI 与法线在 `1e-9` 内一致；该探针已接入 `city-collision-authority-factories.test.mjs`；
- render-proxy 代理进入 role≠ignore 的数量为 0。另有 town-center 12 个初始隐藏的 outdoor-market canopy，它们不是合批源，而是独立动画可见性状态，继续沿 legacy visibility 规则排除。

在上述测试变绿之前，禁止扩大 `createOptimizedStaticSceneBatch` 的覆盖面（这直接约束 §9.12 给展示区补静态合批的工作：**只能给不进 catalog 的 demo 加，或等本条闭合**）。

### 9.2 P0 — mapLod 指标拆分

`showcaseMeshCount` 计全部网格（含已被合批隐藏的源）；`mapVisibleMeshCount` 才看可见性。探针上的「标准小区 98%、豪宅 96%、公园 91%」混入了合批隐藏，不是纯 mapLod。`city-map-lod-tags.test.mjs` 只断言 `mapVisible < showcase`，上界过宽——下界的问题见 §9.13。

每个模板记录三阶段，且每阶段含 mesh / triangle / material key / collision triangle：

1. builder 结束后、合批前：effectively-visible；
2. 展示区静态合批后：visible；
3. `applyMapLod` 后：visible。

阶段 1 不能靠「工厂返回后再 traverse」得到，见 §9.1 的 `optimizeStatic: false` / 合批器 snapshot。R5 与 R1 共用这一机制。§3.1 的历史表在三阶段落地前只作 provisional。

**2026-08-21 R5 实施状态（已完成）：**

- `cityMapLodMetrics.ts` 通过 catalog adapter 分别构建 `optimizeStatic:false`、`optimizeStatic:true`、`optimizeStatic:true + applyCityTemplateMapLod` 三棵独立场景树；三个阶段都使用共享的有效 range/triangle 口径和 `cityMaterialBatchKey`；
- `perf-probe-map-lod-stages.mjs` 自动覆盖 32 个 factory 模板；外部 GLB 的 `street-tree` 明确列为非 factory 跳过项，不能被误报为漏测；旧 `perf-probe-lod.mjs` 仅保留为兼容入口并转发同一权威结果；
- F2 复核后的汇总结果为 mesh **77,507 → 10,679 → 7,665**，effective triangles **1,271,400 → 1,270,944 → 1,142,574**，逐模板 material-key 数之和 **1,019 → 1,019 → 925**；solid collision triangles **1,024,328 → 1,024,328 → 1,014,304**，surface collision triangles **18,846 → 18,846 → 18,846**；新增 134 mesh 来自恢复独立 identity 的 hook 可变灯具，属于已审核正确性成本；
- `tests/fixtures/city-map-lod-stages-baseline.json` 保存 32 个模板各自的三阶段五元组；测试要求全部字段精确匹配、合批前后碰撞严格不变、mapLod 的 render 指标不增加，且 8 个已审核重模板必须严格下降。

因此 §3.1 的旧表继续只作历史记录；新回归与方案判断一律引用本节三阶段基线。

### 9.3 阴影拆分：选定骑手 blob / contact shadow

当前 `cityShadowRefresh`：0.25 m dead zone，骑手变化时每 80 ms 整张 1024² 刷新（`ForestScene.ts:1277-1322`）。在 `configureShadowBudget` 里 city 是 1024² + `PCFShadowMap` + `shadowMap.autoUpdate = false`。骑行时 `riderPoseChanged` 几乎恒真，等于 12.5 Hz 全量重绘整座静态城市的阴影图。

**选定方案 B：静态城市 DirectionalLight 不含骑手；骑手用投影 blob / contact 贴片。** 否决双 DirectionalLight（方案 A）：接收端每片元采样两张 shadow map，还要处理双重光照能量、`Object3D.layers` 分流和接收面一致性，成本和回归面都大于视觉收益。

v1 合同：

- 静态灯：只含城市静态投射者；dead zone 放到数米（与 texel 对齐后再居中）；`autoUpdate=false`，越界才 `needsUpdate`；
- 骑手：`castShadow = false`，脚下一块贴合当前 rideable surface 高度与法线的衰减 blob（或屏幕空间接触阴影），不进 shadow map；blob 平面法线跟随地面，只有椭圆长轴/偏移参考固定太阳水平投影；离地、跳跃或无有效 surface 时按高度渐隐；
- 不刷新时**不得**修改 Three.js 的 `sun.position`、`sun.target` 或 shadow camera/matrix。blob 使用独立的固定太阳方向常量，不读取一个被单独移动的 DirectionalLight；
- 真正刷新时，`syncShadowRig` 原子更新 sun + target + shadow camera，先更新 sun/target 的 world matrix，再调用 `sun.shadow.updateMatrices(sun)`，从更新后的 shadow camera 生成本次 `shadowFrustum`，最后设置 `needsUpdate=true`。直到下一次刷新，shadow rig、shadow matrix 与 shadowFrustum 作为同一冻结快照复用；
- 阴影相机 ±70 m ortho 暂时保留，与 §9.11 的 `shadowFrustum` 求交一起改。
- blob 使用透明衰减材质，`castShadow=false`、`receiveShadow=false`，有 polygon offset 或法线偏移以避免 z-fighting；坡面和道路高程必须进入浏览器截图验收。

**2026-08-21 R6 实施状态（已完成）：**

- `riderContactShadow.ts` 用单个 `PlaneGeometry` + 无纹理 shader 实现椭圆衰减；运行时复用 pose/vector/matrix 存储，不产生每帧临时向量；材质 `transparent=true`、`depthWrite=false`、polygon offset 开启，贴片不投射也不接收 shadow；
- city document 从 `CityMotorcycleAdapter` 的权威 surface sample 读取高度和完整法线；legacy city 用同一 surface 高度场梯度重建法线。贴片法线贴合坡面，长轴与中心偏移只使用独立固定太阳方向；0.18 m 开始渐隐、1.35 m 完全隐藏；
- `ForestScene` 在城市模式把骑手所有 mesh 的 `castShadow` 清零，森林模式恢复原阴影；contact shadow 独立于 rider 旋转层级，地图 rebuild 不会误释放其资源；
- `shouldRefreshCityShadow` 明确忽略 `riderPoseChanged`，编辑与骑行统一采用 4 m dead zone；shadow rig 的冻结快照/原子刷新合同保持不变；
- Node 回归锁定坡面法线、固定太阳投影、surface 高度、离地渐隐、shader/material 状态与 dead zone。Cedar Chromium 实际渲染中 contact plane 增加 1 call / 2 triangles；重置采样后的 184 个骑行稳态帧，`riderStaticShadowCasters=0`、`riderContactShadowVisible=true`、`staticShadowRefreshes=0`。

目标 GPU 骑行截图已确认 contact shadow 贴地、道路高程连续且无静态骑手投影；当前截图作为首版视觉基线，后续同 pose 变更执行差分。

### 9.4 Far LOD 生产化

`setPlacementLod` 与单测存在，生产 `getBatchTemplateDefinition` 不填 `farGeometry`，渲染器不调用 `setPlacementLod`。「编辑器强制远 LOD」尚不可执行。

`createVisualBatches` 会把同材质、同 layout、同 shadow policy 的离散部件合成一个 slot；一个 slot 的 bounding box 可能横跨整栋楼或整个园区。因此**禁止**直接把每个既有 slot 的全局 bounding box 变成 BoxGeometry：窗户、栏杆、屋顶等会成为互相重叠的大色块，而且 slot/draw-call 数不下降。

v1 不引入手工美术资产，但在 bake 时生成**模板级或空间连通块级 massing proxy**。运行时继续采用稳定 near-slot 数，把逻辑上的 1–3 个 far 体块分配给兼容的指定 slot。每个 slot 在模板注册时固定一种 far 策略：

- `proxy`：有兼容 `farGeometryId`，far 档切换到 proxy；
- `hidden-in-far`：far 档不承担体块，实例不可见；
- `keep-near`：小型模板或属性不兼容时继续使用 near geometry，作为正确性回退。

选定 `setVisibleAt(false)` 表达 `hidden-in-far`，不注册占位空 geometry。这个选择是为了让“无 far 内容”成为显式 slot 策略，并避免占位 geometry 进入 geometry 数、拾取与结构指标；**不是**因为 three 0.178 不能注册零容量 geometry。`setGeometryIdAt` 不能换材质，因此每个 proxy 必须落入兼容的材质/layout pool。本阶段硬目标是降低远景 triangles；当前 pool calls 已有界，不承诺 far LOD 进一步降低 calls。

`BatchedMesh` 只有一个最终 visibility bit，而 placement 实际有三个正交状态。`PlacementRecord` 必须拆开保存：

```ts
type FarSlotPolicy =
  | Readonly<{ kind: "proxy"; farGeometryId: number }>
  | Readonly<{ kind: "hidden-in-far" }>
  | Readonly<{ kind: "keep-near" }>;

type PlacementRecord = {
  authoredVisible: boolean;  // 文档/编辑器显隐
  renderSetVisible: boolean; // color frustum 与冻结 shadowFrustum 的并集
  lod: "near" | "far";
  // ...
};

function lodSlotVisible(slot: RegisteredSlot, lod: "near" | "far"): boolean {
  return lod === "near" || slot.farPolicy.kind !== "hidden-in-far";
}

function applyInstanceRenderState(placement: PlacementRecord): void {
  const placementVisible = placement.authoredVisible && placement.renderSetVisible;
  for (const instance of placement.instances) {
    const { slot, instanceId } = instance;
    const slotVisible = lodSlotVisible(slot, placement.lod);
    const geometryId = placement.lod === "far" && slot.farPolicy.kind === "proxy"
      ? slot.farPolicy.farGeometryId
      : slot.nearGeometryId;
    slot.pool.mesh.setGeometryIdAt(instanceId, geometryId);
    slot.pool.mesh.setVisibleAt(instanceId, placementVisible && slotVisible);
  }
}
```

`addPlacement`/freelist 复用、`setPlacementVisible`、`setPlacementLod`、`updateVisibility` 都只能更新自己的状态后调用 `applyInstanceRenderState()`；禁止在其他路径直接批量 `setVisibleAt`。`movePlacement` 更新 bounds 后由同帧 visibility update 收敛。`visibleInstances` 按 `placementVisible && lodSlotVisible` 的真实 slot 数累计，不能继续使用 `placement.instances.length`。拾取仍走 canonical near geometry，不读取最终 visible bit 来决定编辑器是否可选；只有 `authoredVisible=false` 的 placement 不可选。

| 项 | 合同 |
|---|---|
| 生成 | 先按空间连通块/建筑主体聚类，再归并为每模板 1–3 个主要体块；小型模板可 far=near。阈值以实测的近档三角形、投影误差和体块数量写入模板诊断，不得保留未定义的“< 阈值” |
| attribute | position/normal/uv 必须从体块正确生成；若 pool 还要求 color/tangent/自定义 attribute，必须定义逐 attribute 默认语义（例如颜色白色而非全 0），否则该模板回退 near，不得盲填 0 |
| 距离 | 使用 placement bounding sphere/AABB 的屏幕投影尺寸或屏幕空间误差，并带双阈值滞回；160/180 m 只作为 Cedar 初始调参，不作为所有模板固定合同 |
| 视觉 | 编辑器 fit-to-bounds 全图、200 m 骑行视角都能识别主体体块；滞回带内不得闪烁、重叠色块或明显 z-fighting |
| 阴影 | far 仍按原 `castShadow` 资格投射；blob 骑手阴影不依赖 far |
| 拾取 | placement id 映射不变；精确拾取永远检测 canonical near geometry，不能对 massing proxy raycast |
| 碰撞 | far/near 只改渲染 geometry，collision owner 与 surface source 完全不变 |

状态机验收必须覆盖：near/far 往返；far → 离开 render set → 重入；far 档 authored hide/show；剔除期间 far → near；删除后 instance id 复用；color frustum 不相交但 frozen shadowFrustum 相交。每一步同时断言 geometry id、逐 slot visibility、`visibleInstances` 与 canonical near picking，防止 hidden slot 被复活。

**2026-08-21 R8 far LOD 实施状态（代码门已完成）：**

- `cityTemplateCache` 为 33/33 catalog 模板选择一个兼容 opaque host slot，以完整 near bounds 生成 12-triangle massing proxy；position/normal/uv 沿用正确 box attribute，Float32 color 默认白、tangent 默认 `(1,0,0,1)`，未知/非 Float32 layout 拒绝 proxy 而不是盲填；
- host slot 为 `proxy`，其余 opaque slots 为 `hidden`；透明/特殊 InstancedMesh 保存每实例 base matrix，far 时退化并在整批全 far 时关闭 root，near 时精确恢复。collision source、surface source 与 canonical near geometry 不变；
- `CityBatchWorld.updateLod(camera)` 用 bounding sphere 的屏幕投影半径，near→far=4.5%、far→near=6%，不使用固定世界距离；changed placement 才同步 geometry/特殊 fallback，稳态不重复写 buffer；
- 单测覆盖 near/far 往返、far 后剔除与重入、剔除期间回 near、authored hide 优先、真实 visible-instance 计数、删除后 id 复用和 canonical near picking。33 个生产模板逐一断言恰好一个 proxy 且 proxy=12 triangles；
- Chromium：Cedar 编辑视角从 R7 的 19 calls / 19.2k triangles 降到 **16 / 10.8k**；骑行近景保持 **110 / 396k**。20× 全图从 R7 暴露的 **4,111 / 34.32M** 降到 **49 / 0.85M**（约 −98.8% calls、−97.5% triangles）。

目标 GPU 全图与商场近景截图已确认 proxy/near 切换无黑帧或缺件，并建立首版基线；全图 far proxy 的颜色对比偏弱，若后续同 pose 审核确认大型园区主体识别不足，只把对应模板升级为 2–3 个连通体块，不回退三状态合同。

### 9.5 Instance tint 与编辑器高亮争用

`setPlacementTint(null)` 现写死白色。Phase 2b 必须每 slot 保存 `baseTint`，高亮叠加，结束后恢复基色。

**R8 已闭合：** `CityBatchTemplateSlot.baseTint` 在注册时克隆为 slot 权威基色，placement 初始化和 `setPlacementTint(null)` 都恢复该值，不再硬编码白色；红色高亮→清除→恢复非白 baseTint 已有回归。

### 9.6 拾取：选定 AABB 宽相 + 候选精确 raycast

`cityVisualLayerManager.raycast` 对 `layer.children` 全量 `intersectObjects(..., true)`。`BatchedMesh.raycast()` 会遍历全部 active+visible instance，不能靠「先筛分块再调用全局 raycast」得到局部复杂度。

**选定：** 用 `CityBatchWorld` 已有的 `placement.worldBounds` 做 CPU 宽相（射线 vs AABB），只对命中的 placement 做**无状态的候选 instance 三角形检测**。通过缓存的 canonical near geometry、`getMatrixAt()` 和 geometry range 把 ray 变换到候选局部空间；不得调用 `setVisibleAt` 临时隔离。后者只有在隐藏/恢复其余全部实例后才能隔离候选，仍是 O(N)，还会设置 BatchedMesh 的 visibility dirty 状态并污染同帧渲染。

2,500 AABB 的“低于 1 ms”必须由 20× 空间 fixture 在目标 Chromium 复测；实现需复用 Box3/Ray 临时对象、避免每次拾取分配。若 placement 继续增长再引入空间索引，不在 v1 预建。

否决：专用 GPU pick proxy（多一份网格与同步）；空间分区 BatchedMesh（改 pooling 边界，收益不明）。

透明 / 多材质 fallback 仍走现有 `objectPlacement` 祖先链，但宽相应先用这些 attachment 的包围盒过滤，禁止对整层 `intersectObjects(..., true)`。

**2026-08-21 R8 拾取实施状态（已完成）：**

- BatchedMesh 不再进入 Three.js 全实例 `raycast()`；`CityBatchWorld` 对所有 placement 的实时 `worldBounds` 做无分配 AABB 宽相，只把命中候选的 canonical near slot 交给复用 scratch mesh 精确检测，far proxy 永不参与拾取；
- object fallback 在 mount 时冻结逐 placement world AABB；InstancedMesh fallback 保存逐实例 base/world matrix 与 AABB，同样只精确检测候选。无 placement 映射的道路与派生交通信号根完全排除出编辑器拾取；
- 拾取不调用 `setVisibleAt`，不修改 BatchedMesh geometry id/visibility。authored hidden placement 不可选；render-set cull 或 far placement 仍按 canonical near 可选；
- 2,500 placements、单候选的 Node 热路径平均约 **0.036ms**。1920×1080 SwiftShader 的全图空候选观测为：1,660 placements **0.8ms**、3,320 placements **1.4ms**；后者超出“2,500 <1ms”的对象数，正式 2,500/目标 Chromium 门仍按原合同执行，不拿插值代替实测。

### 9.7 空间分布 fixture 是发布门槛

`createCityPerformanceStressDocument` 重叠同一 transform，只能证明 pool 不随实例数线性涨。它不能覆盖：透明 fallback、旧 InstancedMesh 256 m cell、道路大包围盒、快速移动时的可见集。

v1 合同（写进 `cityPerformanceStress.ts`，禁止再复制重叠 transform）：

| 项 | 值 |
|---|---|
| 源 | Cedar Crossing 当前 **166 placements + 55 roads** 及其节点、信号 override（旧 117 数不得硬编码） |
| 布局 | 5×4 网格，共 20 份。每份平移 `(i * (W + 40), 0, j * (D + 40))`，`W×D` 为同时覆盖源 placements 与 road graph 的轴对齐包围盒 |
| ID / 引用 | 每个 replica 给 placement id、road node id、road edge id 加稳定前缀；同步重写 edge `a/b` 与 `intersectionOverrides` 的 node key。生成结果必须通过 `validateCityRoadGraph` 与 document parser，禁止重复 ID 或悬空引用 |
| 道路 | 随 replica 平移全部 node 坐标并复制完整路网；信号从重写后的 graph 重新派生，保持 Cedar 的道路 / 建筑 / 透明 fallback 比例 |
| 相机路线 | 预热结束后采集三段共 30 s：① 编辑器全图 8 s；② 骑行沿 replica (0,0) 主干道 12 s；③ 斜切到 replica (2,1) 商场入口 10 s |
| 编辑器相机 | 用总 world bounds + FOV/aspect 自动 fit 高度与 near/far，不写死 Y=180；记录最终 pose 供回归复现 |
| 视口 | 1920×1080，DPR=1.0，headed Chromium |
| 预热 / 采集 | 独立预热 10 s（不计入任何路线指标），随后连续采集上述 30 s（见 §9.8） |

**2026-08-21 R7 实施状态：代码门与目标硬件采样均已完成。**

- `cityPerformanceStress.ts` 同时计算 placement 与 road graph 的源 bounds；1×/10×/20× 均复制完整 placements、nodes、edges、intersection overrides，稳定前缀同步重写 edge `a/b` 与 override key；每次生成都经过 `validateCityRoadGraph` 和 `parseCityMapDocument`；
- 20× 严格采用 row-major 5×4，stride 为源 `W/D + 40 m`；导出三段 8/12/10s 确定性 route 元数据。全图相机 pose、near/far 由 world bounds、42° FOV 与实际 aspect 计算，`ForestScene` 的浏览 clamp 同步扩大到 fixture bounds；
- 浏览器结构门固定 1920×1080，并对 1×/10×/20× 各执行 8s 编辑器平移冒烟；三档 pool 保持常数，batch instances 随 placement 容量扩展，完整道路数为 55 / 550 / 1,100；
- SwiftShader 全图诊断为：1× 1,124 calls / 2.21M triangles，10× 2,555 / 17.42M，20× 4,111 / 34.32M。该结果证明重叠 fixture 曾隐藏 fallback/道路提交增长，也直接支持 R8 far LOD 与宽相优先级；软件渲染帧时禁止写入产品预算。

headed 目标 GPU 的 10s 独立预热 + 30s 三路线已经按 §9.8 执行。采样同时发现旧 220m 骑行 far plane 的体验回归；修正后的性能与 calls 缺口见下节，R7 本身不再保留“待跑”状态。

### 9.8 采样协议

文档若要求预热 10 s / 采集 30 s，测试不得只等 180 帧。RAF、CPU/GPU render 与 calls 当前分别保留最多 1,800 个样本；它们是独立口径，RAF 间隔不能冒充 CPU render duration。

发布采样必须：

- 把环形缓冲扩到 **至少 1800** 帧，或改为流式分位（直方图 / t-digest），不要在 30 s 窗口里丢掉前 20 s；
- 分开记录：RAF p50/p95、CPU render duration、GPU timer（若可用）、颜色 pass calls、强制 shadow refresh 次数；
- **区分普通颜色帧和 `shadowMap.needsUpdate === true` 的帧**，各自的 calls / GPU time 不得混成一个平均数；
- `renderer.info.render.calls/triangles` 是 Three.js 的提交统计，不得描述成“直接从驱动读取”；GPU 时间只由 timer query（可用时）提供。颜色/阴影 calls 需要显式 pass instrumentation；不能从两个不等价视角的总 calls 相减猜测；
- 180 帧只适合冒烟，不适合作为 20× 性能结论。

**2026-08-21 目标硬件结果。** 环境为 headed Chromium、Apple M5 Pro / ANGLE Metal、WebGL2 + `WEBGL_multi_draw` + `EXT_disjoint_timer_query_webgl2`、1920×1080、DPR=1。测试先等 collision ready，再独立预热 10s，随后执行 8/12/10s 路线。空 mesh pass probe 在同一次 render 中、首个颜色对象提交前读取 Three.js counter，从而显式分离 shadow pass；三段 `renderPassProbeMisses=0`。

| 路线 / far plane | RAF P95 | CPU render P95 | GPU P95 | 普通颜色 calls P95 | shadow-refresh calls P95 | 视觉结论 |
|---|---:|---:|---:|---:|---:|---|
| 20× 编辑器全图 | 9.3ms | 5.9ms | 2.74ms | 50 | 33 | massing 连续，建立基线 |
| 20× 骑行，旧 220m | 9.2ms | 5.2ms | 3.82ms | 198 | 114 | **失败：道路与建筑在两三个街区外硬截断** |
| 20× 骑行，现 3,200m | 11.8ms | 9.7ms | 4.99ms | 631 | 171 | 道路、信号与建筑连续进入雾；帧预算通过，calls 门失败 |
| 20× 骑行，R12 / 3,200m | **9.0ms** | **1.8ms** | **1.66ms** | **148** | **44** | 远景连续、玻璃保持透明层次；帧与 calls 门均通过 |
| 20× 商场斜切 | 10.2ms | 9.2ms | 3.75ms | 417 | 122 | 近景完整；编辑态无 150 calls 硬门 |

因此 220m 方案被否决，`chooseCameraDepthBudget()` 将城市骑行 far plane 固定为 3,200m；在现有 `FogExp2(0.00055)` 下投影边缘只剩约 4.5% 可见贡献，避免新的可见硬边。该值覆盖正常 Cedar 地图的对角线；更大的压力世界由雾、AABB 可见集和 far massing LOD 负责，不允许再通过缩短 far plane 回收 calls。

R12 按上述顺序执行完成：首次精确归因为主颜色 341 + transmission 预通道 290、阴影 171；地图专用 alpha-glass 将 transmission 降为 0，instance tint 与有限 PBR 分档把可见 opaque pool 降到 83–85，512m fallback 分桶再将同路线透明/特殊调用降到 28–46。完整路线 calls P95 为 148/44。LOD 阈值、雾与 3,200m 视距均未用于碰预算；fallback 三角形在最重归因 pose 仅从 49,492 增至 55,348，换取 9 次提交下降。

### 9.9 P0 — 工厂几何内存与统一释放入口

材质 Palette 不是最大内存项。当前 33 个工厂同时构建是上界：**61,041** 个 distinct geometry（59,108 可缓存 primitive / 2,653 值键）vs **1,080** 个材质对象。6 排标准小区一次构建为 13,589 Mesh / 10,337 geometry，其中 10,273 个可缓存 primitive、188 个值键。

完整实测表见 §4。R3 只做 primitive cache + 释放入口；验收必须报 Cedar / 目标满图 / 单个最重 demo 三组工作集，不能只用 33 工厂同时驻留的上界。

**统一释放入口（R3 的一部分，不是可选项）：**

```ts
export type ResourceCacheLease = Readonly<{
  generation: number;
  release(): void;
}>;

export function disposeSceneResources(root: THREE.Object3D): void;
export function isCacheOwned(resource: THREE.BufferGeometry | THREE.Material): boolean;
export function acquireResourceCacheLease(): ResourceCacheLease;
export function retireResourceCacheGeneration(): Promise<void>;
export function resetResourceCacheForTests(): void;
```

`disposeSceneResources` 跳过 `cacheOwned`。所有 demo、`ForestScene`、`cityDocumentRenderer`、`cityTemplateCache.disposeObjectResources`、fixture 都改走它。禁止再手写 `object.geometry.dispose()`。

`ResourceCacheLease` 至少包含只读 generation 与幂等 `release()`。每个使用 cache-owned primitive 的 scene/template generation 在开始构建前 acquire，在 `disposeSceneResources(root)` 之后 release；`retireResourceCacheGeneration()` 先切出新 generation，旧 generation 只有 borrower=0 才 dispose。调用方不能把 lease 藏在 Material/Geometry `userData`，由 scene/template owner 显式持有。

还必须有：

- cache 使用可枚举的强引用 `Map<PrimitiveKey, BufferGeometry>` 持有资源，`cacheOwned` 使用可替换的 `let WeakSet`；WeakSet 不可遍历/清空，测试 reset 时必须在 dispose 完成后替换实例；
- cache 的显式 `dispose()` / `resetResourceCacheForTests()` 生命周期必须有 generation/lease 边界：只有所有借用该 generation 的场景已 teardown，才允许 dispose 并清 Map。测试顺序固定为“卸载场景 → 释放 lease → reset”；
- Vite HMR 不得在仍有 live scene 引用时直接 dispose/reset。二选一：factory HMR 触发完整页面/renderer teardown 后 reset；或旧 generation 进入 retired，等 borrower=0 再 dispose。禁止让页面拿到已 dispose 的 buffer；
- 两个场景共享同一 geometry，卸载其中一个，共享对象的 `dispose` 事件次数为 0；
- HMR/reset 验收：旧场景仍 live 时发布新 generation，旧 geometry 的 dispose 事件为 0；旧场景释放后恰好为 1，新场景 geometry 仍可上传/渲染；
- 开发态断言不能只拦 `rotateX` / `applyMatrix4` / `setAttribute`：至少覆盖 translate/scale/center、set/deleteAttribute、setIndex、setDrawRange、group 修改、computeVertexNormals/computeTangents 等 BufferGeometry mutator；测试还要在全部 factory 构建前后对 cache-owned attributes/index 做 checksum，抓住 `attribute.setXYZ()` 或直接 typed-array 写入。`clone()` 之后的副本可以改。

**2026-08-21 R3 已完成：** `cityResourceCache.ts` 落地强引用 generation、显式 lease、安全 primitive 内容键、统一 scene disposer、开发态 mutator 和全内容 checksum。catalog/template、`ForestScene`、`cityDocumentRenderer`、全部 demo 与性能 fixture 已迁移；缓存替换/registry HMR 只 retire generation，live borrower 归零后才恰好 dispose 一次。三组工作集由 `city-resource-cache-workloads.test.mjs` 锁定；33 工厂安全键结果与旧理论参数键仅相差 17 个对象和约 14 KB，因此不以放宽键换取数字。

#### 9.9.1 地图 bake 后释放隐藏源树（R11 已完成，不在 R3）

`createCollisionCompileSource` 当前仍把 `resolvedHeightScale` 放进 source/cache key，并从 `record.canonicalSource` 按高度重新打包（`cityTemplateCache.ts:988-1008`、`cityDocumentCollisionPipeline.ts:179-186`）。`CompiledCollisionOwnerTransform` 又明确只接受 uniform scale。若直接释放源树，编辑器新增高度比例就无法生成碰撞。

**选定方案：只编译高度 1 的不可变 canonical collision source，`heightScale` 属于 owner transform，不属于 compiled source identity。** 正常运行时不再按高度重建 factory；未通过本节验收的模板保留源树并退出 R11，不能释放后再隐式重建。

Owner API 改为：

```ts
export type CompiledCollisionOwnerTransform = Readonly<{
  x: number;
  y: number;
  z: number;
  yawRadians: number;
  uniformScale: number;
  heightScale: number;
}>;
```

`heightScale` 默认 1，且必须 finite、`> 0`。设 `u = uniformScale`、`h = heightScale`，canonical 到世界的完整变换为：XZ 先乘 `u` 再绕 Y 旋转和平移，Y 为 `worldY = owner.y + canonicalY * u * h`。对应合同如下：

| 路径 | 必须执行的变换 |
|---|---|
| owner broad phase | XZ bounds 仍按 `u`；`minY/maxY = owner.y + canonicalY * u * h`，更新 spatial hash 中的 world bounds |
| circle/wall/fallback sweep | XZ start/delta 与 radius 仍除以 `u`；`request.minY/maxY` 改为 `(worldY - owner.y) / (u * h)`；sweep fraction/TOI 保持 `[0,1]`，命中距离继续由世界 XZ move length 计算 |
| 一般 segment/ray | 端点或未归一化 displacement 的 Y 除以 `u*h`，不要只变换后再归一化方向却沿用旧 maxDistance；若 API 强制单位方向，必须同步换算 canonical maxDistance，并由世界命中点重算距离 |
| surface sample | canonical plane 求出的 height 乘回 `u*h`；surface chunk、triangle plane 与 BVH 保持 canonical，不按 placement 改顶点或重建 |
| normal/slope | canonical 法线先变为 `(nx, ny / h, nz)` 并归一化，再应用 yaw；`gx/gz` 从变换后的单位法线重算 |
| curb/boundary | 两侧 surface height 都先变回世界再计算 `stepDeltaY`、step-up/down 与 bump；米制阈值保持世界单位 |

`variantKey`、packed `sourceId/cacheKey` 与 Worker/IndexedDB compiled cache 移除 `resolvedHeightScale`，只保留模板 source identity、registry generation 和会真实改变 canonical geometry 的版本字段。placement 创建 owner 时传入 `heightScale=resolvedHeightScale`；高度修改只发布新的 owner/runtime world bounds，不触发 pack、Worker BVH compile 或 surface chunk 重建。道路、legacy owner 与没有高度拉伸的 source 显式使用 1。

释放顺序固定为：

1. 从仍存活的 `canonicalSource` 打包并编译高度 1 的 solid + surface source；
2. 用所有生产 owner 建立带 `heightScale` 的 runtime，并完成新旧路径等价性测试；
3. 确认 cache miss、文档高度编辑和 runtime 重建均不再访问 factory/source tree；
4. 最后才释放隐藏源树。任一模板失败则只保留该模板源树，不影响已通过模板释放。

等价性 fixture 对同一 canonical template 同时走“旧：按高度 bake”与“新：高度 1 source + query transform”，至少覆盖 `h = 0.6 / 1 / 1.32 / 1.61`、`u != 1`、非零 yaw/translation，并逐项比较：owner Y bounds、wall sweep、fallback triangle、surface height/法线/坡度、curb/boundary step、TOI 与世界命中距离。离散 id 必须完全一致；浮点量使用明确的小 epsilon。R1 的碰撞权威分离和该 fixture 全部通过之前，禁止释放任何源树。

**2026-08-21 R11 已完成：** `createCollisionCompileSource` / `createSurfaceCollisionCompileSources` 不再接收高度参数，source id 与 pipeline variant key 均移除高度；每个 record 缓存唯一高度 1 packed Promise，失败会驱逐，成功后可跨 owner 高度与文档 generation 复用。canonical bake 不绑定任一 document generation 的 AbortSignal：旧 generation 取消时只中止自己的等待，共享 bake 由内部 pin 保护至完成，避免污染同时启动的新 generation。`CompiledCollisionOwnerTransform.heightScale` 默认 1 且严格要求 finite、`>0`；道路和 legacy owner 显式为 1，catalog/signal placement 传入 resolved height。

释放采用逐模板门控：solid 与全部 surface packed payload 均 ready、Worker 编译均成功后，pipeline 才调用 `releaseCanonicalSourceTree()`；该入口只释放/清空源树节点和不再需要的 geometry，并释放 primitive-cache lease，visual batch 使用的材质继续由 record 生命周期持有。重复释放幂等；后续碰撞请求只能返回 retained immutable payload，若 payload 缺失则 fail-fast，绝不重建 factory。

验收证据：

- `city-height-scale-equivalence.test.mjs` 对 `h=0.6/1/1.32/1.61`、`u=1.3`、非零 yaw/translation 比较 legacy height-baked 与 canonical owner transform；owner 六向 bounds、wall、fallback BVH candidate/hit、surface height/normal/slope、boundary handle/step/bump、TOI 与世界距离均等价。
- 文档高度变化保持同一个 compiled variant key，只改变 owner `resolvedHeightScale`；非法 `0/负数/NaN/Infinity` 全部拒绝。
- `city-template-source-release.test.mjs` 证明任一 payload family 未 ready 时拒绝释放；释放后 source child 为 0，相同 packed object identity 命中且 visual attachment 仍可创建。
- 并发取消测试证明旧 generation abort 只拒绝旧 await，共享 canonical bake 与新 generation 正常完成；retirement 在内部 packing pin 清零前不得释放 record。
- Chromium 城市编辑流程在首次 street-light 编译后观测释放计数为 1，再旋转同一 placement 时 owner 增量更新成功、释放计数不增加且无 factory/source-tree 访问错误。
- Cedar Chromium 完整地图成功释放当前使用的 **27** 个模板源树（26 个 catalog + derived traffic-light），1×/10×/20× 文档切换释放计数保持 27，不随 placement 副本数增长。

### 9.10 P0 — BatchedMesh pool 级包围球永不失效

问题根因：three 0.178 的 `Frustum.intersectsObject` 对 BatchedMesh pool 的 `boundingSphere` 懒计算一次后永久缓存，`setMatrixAt` / `addInstance` / `deleteInstance` 都不会置空它。仅设置 `perObjectFrustumCulled=false` 不能关闭 renderer 对整个 pool 的对象级剔除。

**2026-08-21 已修复：** `createCityBatchedMeshWorld()` 创建每个 pool 时同时设置 `mesh.frustumCulled=false`、`perObjectFrustumCulled=false`、`sortObjects=false`。外部 placement AABB 可见集成为唯一剔除权威，增量 add/move/remove 不再依赖 pool sphere。

`tests/city-batch-world.test.mjs` 锁定三个 flag；不采用每次编辑手动置空 `boundingSphere` 的备选方案。

### 9.11 P1 — 可见集的阴影膨胀与阴影相机不对齐

`cityBatchWorld.ts:132-139` 的 `templateLocalBounds` 对每个模板按 `0.8 × height + 12` 做**各向同性**膨胀，理由是"避免视口外高层的阴影提前消失"。但阴影相机是围绕 focus 的 ±70 m ortho 盒（`ForestScene.ts:1317-1320`），光源方向固定为 `(-28, 48, +22)`。因此：

- 离 focus 超过约 70 m 的 placement 根本进不了阴影图，那部分膨胀是纯浪费；
- 膨胀是各向同性的，但阴影只朝一个象限投，另外三个方向的扩张无意义；
- §8.5 里被否掉的「固定 12 m margin」（100 calls / 1.57 M tris，对比保留方案 117 / 1.69 M）很可能是安全的，**否掉它的理由没有考虑阴影相机边界**。

正确判据：camera frustum 现成；shadow frustum 必须来自 §9.3 中**最后一次真正刷新 shadow map 的冻结 shadow-rig 快照**。当前帧若刚越过 dead zone，必须先原子更新 sun/target/shadow camera、调用 `sun.shadow.updateMatrices(sun)` 并生成新 frustum，再做 batch visibility；普通帧复用旧 shadow frustum，不能使用只移动了一部分 light 状态的矩阵。

```ts
placement.renderSetVisible = (
  cameraFrustum.intersectsBox(placement.worldBounds)
  || shadowFrustum.intersectsBox(placement.worldBounds)
);
applyInstanceRenderState(placement); // 内部再与 authoredVisible、LOD-slot 合成
```

`worldBounds` 同时改回**未膨胀**的真实包围盒。§8.5 的约 12% calls/tris 只作为历史候选收益，用新合同重新测量。

但颜色与阴影当前共享一个 instance visibility bit，`shadowFrustum` 独占的 placement 也会进入 color pass；因此 12% 只是历史候选值，不是硬验收。验收顺序为：阴影刷新帧无 caster 缺失、普通帧与缓存 shadow map 对齐、快速移动无闪断，然后记录实际 calls/tris 改善。若 union 带来的 color 额外提交仍显著，再触发 §7 的独立 shadow batches，不在 R2 偷换架构。

**2026-08-21 R2 实现状态：** `updateCityShadowRigSnapshot()` 在 refresh 帧原子更新 sun/target、正交相机、world/shadow matrices 并复制调用方自有 frustum；普通帧不触碰该快照。`CityBatchWorld` 移除旧的各向同性高度膨胀，使用真实 template/placement AABB，并以 color/shadow union 生成 render-set visibility，最终仍服从 authored hide。单元测试锁定冻结与局部状态突变隔离；Chromium Cedar 编辑/骑行实际渲染冒烟通过。目标 Apple GPU 的阴影截图差分及快速移动视觉序列仍属于发布门，不伪装成 Node 自动测试已覆盖。

### 9.12 P0 — 展示区（/demos）性能面（R4 已完成）

两份方案此前只把展示区当作 Palette 的共享对象讨论，没有把它当独立性能面。下表是 **R4 实施前快照**：

| demo | 工厂 mesh | `createShowcaseRenderBudget` | `createOptimizedStaticSceneBatch` |
|---|---:|---|---|
| standard-residential-community | 13,589 | **无** | **无** |
| residential-community | 7,224 | **无** | **无** |
| luxury-villa-community | 3,327 | **无** | **无** |
| hospital-campus / city-street-furniture / transportation | — | **无** | **无** |
| shopping-mall / school-campus / fire-station / city-park / sports-center / city-center / town-center / amusement-park | — | 有 | 有 |

**最重的三个展示区完全裸奔**：裸 RAF 循环、满 devicePixelRatio、`shadowMap.autoUpdate` 默认为 `true`（每帧全量重绘阴影图）、没有静态合批、没有 `createScenePointLightPool`、没有 `applySceneShadowPolicy`。

**但这四件套不能一起加**，因为它们的作用位置不同：

| 措施 | 作用位置 | 是否被 §9.1 阻塞 |
|---|---|---|
| `createShowcaseRenderBudget`（DPR 自适应 + 空闲跳帧 + 阴影节流） | demo 页面组件 | **否**，立即可做 |
| `createScenePointLightPool` | 工厂或 demo-owned factory root | 否（只动灯，不动碰撞可见性） |
| `applySceneShadowPolicy` | 工厂或 demo-owned factory root | 否（只改 `castShadow`） |
| `createOptimizedStaticSceneBatch` | 工厂函数内，会 `visible = false` 源网格 | **是** |

`residential-community`、`standard-residential-community`、`luxury-villa-community` 三个工厂都注册在 catalog 里，给它们加静态合批等于扩大 §9.1 的碰撞丢失面。因此：

- **R4 只做前三项**，其中 `createShowcaseRenderBudget` 收益最大且风险为零（当前是每帧满 DPR + 全量阴影重绘）；
- 静态合批推迟到 §9.1 闭合之后，与其余工厂一起纳入统一验收。

**只接入 `createShowcaseRenderBudget` 不够。** 三个重 demo 都有 shatter morph、focus blend、auto rotate，部分还有内部动画。`createShowcaseRenderBudget.render(scene, camera, continuous=false)` 在 320 ms 无交互后会停画。合同（对齐已接入的 `ShoppingMallDemo.tsx:164`）：

```ts
renderBudget.render(scene, camera,
  rotating || focusBlend > 0.001 || morphChanged || waterOrLightAnimating);
```

| `continuous` | 何时 |
|---|---|
| `true` | autoRotate、focus blend 未结束、shatter morph 进行中、夜景/喷泉等内部动画、`controls.enableDamping` 仍在收敛（`change` 事件已会刷新 `lastActivityMs`，但动画侧必须显式传 true） |
| `false` | 其余静止观察 |

漏传 `true` → 破碎动画冻在半途；永远 `true` → 退回每帧全量渲染，预算形同虚设。R4 验收必须覆盖这两种回归。

**2026-08-21 R4 已完成：** 仓库当前 15 个 `*Demo.tsx` 全部创建、使用并释放同一个 `createShowcaseRenderBudget`；禁止裸 `renderer.render(scene,camera)` 和硬编码 continuous `true`。`hasContinuousShowcaseActivity()` 统一合成 autoRotate、focus blend、shatter morph、OrbitControls damping 与显式内部动画。最重三个社区展示区在 factory root 上增加 point-light pool 与 shadow policy，并由原 `setPowered` 路径同步 pool。单测锁定 320 ms 静态休眠、100 ms 连续阴影刷新和 15/15 源码覆盖；Playwright 在最重普通小区上观测静态 650 ms **0 draw call**，点击破碎后 draw 恢复且状态完整切换。

最重标准小区的目标 GPU 全景截图已保存并人工检查，当前代码门与首版视觉基线均已完成；后续改动执行同 pose 差分。

### 9.13 mapLod 测试的下界形同虚设

§9.2 说的是上界过宽。下界同样有洞——`tests/city-map-lod-tags.test.mjs:33-39`：

```ts
const retainedByMeshCount = metrics.mapVisibleMeshCount > metrics.showcaseMeshCount * 0.25;
const retainedByMergedGeometry = (definition?.slots.length ?? 0) >= 10
  && (definition?.slots.reduce((sum, slot) => sum + /* 三角形 */ 0, 0) ?? 0) >= 1_000;
assert.ok(retainedByMeshCount || retainedByMergedGeometry, ...);
```

那个 `||` 是逃生门：只要 slots ≥ 10 且总三角 ≥ 1,000 就通过。对这些动辄数万三角的模板，1,000 等于零，所以「保留至少 25%」这条护栏可以被绕过。

**2026-08-21 R5 已闭合：** 旧分支及宽松比例下界已删除。现在每个 factory 都与人工审核后提交的三阶段五元组做精确比较；重模板另有严格降幅断言，碰撞另有 pre/post 不变量。任何无意的 mesh、triangle、材质键或碰撞变化都会要求显式审核并更新该模板基线，不能再由 slots/1,000-triangle 条件绕过。

### 9.14 P1 — 编辑器增量提交与碰撞原子 staging（R10 已完成）

R10 的验收对象是一次 placement add/update/remove，不是初次载入、导入整份文档或 graph/road 编辑。初次载入和 dirty `All` 仍允许完整构建；单 placement 路径必须满足下列边界：

| 子系统 | 单 placement 合同 | 当前实现 |
|---|---|---|
| 视觉 fallback | 只替换受影响 `catalogId × 512 m cell` attachment | 新 attachment 先 staging，成功后释放旧 attachment；其他 cell 对象 identity 不变 |
| BatchedMesh | 不重建 pool | `CityBatchWorld.addPlacement/movePlacement/removePlacement` 原位更新，并保留 rollback 回调 |
| 拾取 | 提交后立即对应新 transform，不能依赖旧渲染可见性 | placement AABB 宽相 + canonical near geometry 精确 raycast |
| dirty closure | 普通装饰不污染 Roads/Signals/Minimap | placement 默认只闭合到 Collision/Surface；只有 catalog `entrances` 才追加 Roads 及其依赖 |
| 道路碰撞编译 | 未变 64 m chunk 不重编 | packed 内容 hash 跨 document generation 复用；并发请求去重，失败 promise 驱逐 |
| runtime 空间索引 | 不全量 normalize/rebucket | 以上一代不可变 runtime 为基线，复用未变 owner；变化 owner 重新规范化，仅对受影响 16 m bucket copy-on-write |
| 原子性 | 不出现半份新视觉或碰撞世界 | 视觉先 staging 后 commit；碰撞旧 runtime 保持 ready，新 generation 完整成功且仍为最新后才 swap，失败/过期 runtime 释放 |

碰撞 runtime 每代仍会做一次 owner-id 线性对账并组装新的只读 owner 列表，这是 O(N) 的轻量 JS 工作；它不重新编译未变 source、不重新规范化未变 owner，也不重建全部 16 m 空间桶。若后续目标硬件的连续拖拽采样证明这次线性对账本身超预算，再把 pipeline 输入升级为 editor command delta；当前没有数据支持提前增加该状态同步复杂度。

自动门包括：

- 2,500-placement Node fixture 移动一个对象只记录 1 placement、1 catalog、1 visual cell，BatchedMesh pool 与 instance 数保持不变；该用例也包含初次构建，约 21 ms 只作结构/相对证据，不声明浏览器帧预算。
- runtime 测试覆盖 move/add/remove 后未变 owner 复用、旧 bucket 无残留、精确 sweep 命中新位置。
- Chromium 城市编辑流程覆盖空城首次新增：placement 增量提交为 1，collision staging 期间 `collisionReady=true`，提交后 `collisionOwnerIndexFullRebuild=false` 且受影响 owner/cell 非零。
- road chunk 测试覆盖跨 generation 全命中，以及修改道路端点时仅变化 chunk miss、相邻未变 chunk hit。

---

下一步顺序见 §6.2。R0–R8、R10–R12 与 Palette F1/F2 的代码门已完成，目标 GPU 完整路线和视觉截图均已通过；R9 完整 intern 的现有收益不足，维持 P2 延后。后续只需维持 3,200m 连续远景、骑行普通颜色/阴影 calls P95 150/60 和同 pose 视觉回归合同。
