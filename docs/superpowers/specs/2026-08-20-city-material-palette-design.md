# 城市材质 Palette：降级为 P2，并拆出一个现存缺陷

| 字段 | 值 |
|---|---|
| 文档标题 | Forest Courier · 城市材质 Palette 设计稿 |
| 日期 | 2026-08-20 |
| 修订 | r9 — F1/F2 已落地；R12 证明地图运行时 tint 不依赖进程级 Palette intern |
| 状态 | F1/F2 已完成；Palette intern 仍为 P2 候选，不进入当前主线 |
| 产品 | Forest Courier · Map Workshop |
| 前置文档 | `docs/superpowers/specs/2026-08-19-city-map-performance-design.md` |
| 范围 | `MeshPhysicalMaterial` 键覆盖；可变 / 不可变所有权语义；与 geometry cache 共用的 dispose owner 判定 |
| 非范围 | 减少材质对象数作为立项理由、贴图 intern、纹理 refcount、pool/shader 数下降、量化并色、远档 LOD 外壳 |

---

## 1. 结论（r7）

**本方案降级为 P2，排在 primitive geometry cache（总稿 §4 P0 / §9.9）之后。**

r2 的核心论证是「减少 JS `Material` 对象和重复 uniform 状态」。审查把 30 个可无头构建的 catalog 工厂全量构建后实测，这条收益小到不足以支撑一个独立方案：

| 指标 | 实测 |
|---|---:|
| 材质对象总数（30 工厂） | 1,022 |
| 跨工厂唯一材质值键 | 455 |
| **intern 上限收益** | **−567 个 JS 对象** |
| 同一批工厂的 distinct geometry 对象 | **57,284** |
| 带贴图的材质 | **0** |
| `MeshPhysicalMaterial` 对象（30 adapter 全量构建，按身份） | **12** |
| `MeshPhysicalMaterial` 源码构造点 | ≥4（mall / amusement / villa / premium-gate；其余为排数变体各自 mint） |

单工厂 intern 收益接近于零：`residential-community` 63 → 61 个材质对象，但同时有 5,938 个 geometry 对象、8.08 MB 属性缓冲；`standard-residential-community-6-row` 82 → 70 个材质对象，对应 13,589 mesh / 10,337 geometry。

r2 列出的 v1 四条目标，现在的判定是：

| r2 目标 | r5 判定 |
|---|---|
| 1. 减少 JS `Material` 对象和重复 uniform 状态 | **收益 567 个对象，可忽略**。同一批工厂的几何侧是 57,284 个对象 |
| 2. 统一可变 / 不可变所有权，夜景 hook 与 `setPowered(false)` 互不污染 | **前提不成立**，见 §2.1。该污染是 Palette 自己会引入的 |
| 3. 防止 demo / cache 卸载误 dispose 共享实例 | 同上，是 intern 引入的问题 |
| 4. 为后续 instance tint 提供稳定语义 | **已由总稿 R12 在地图 ingestion 层独立实现**；不需要进程级 intern |

因此 Palette 只剩两条真实理由，且都不需要「进程级 intern 表」这套基础设施：

1. **补齐 `materialBatchKey` 对 `MeshPhysicalMaterial` 的字段覆盖**——按对象身份 12 个，错误合池是真 bug；该独立快修已经完成（§4）；
2. **为 instance tint 归并预留所有权语义**——总稿 R12 已用模板 cache 持有的地图专用白底派生材质实现，源/展示材质保持 identity；不需要把本稿 P2 intern 提前。

另外从本稿**拆出的一个与 Palette 无关的现存缺陷**——静态合批的材质别名作用域大于合批作用域（§3）——已由 F2 独立修复，没有绑到 Palette 的迁移序列里。

R12 同时对地图专用 opaque 派生材质做有限 roughness/metalness 分档，并把 transmissive glass 降级为保留 alpha 的地图副本；这些变更以 calls 归因和视觉回归为依据，只存在于 `cityTemplateCache` 生命周期内，不是工厂 Palette intern，也不改变本稿 P2 定级。

---

## 2. 复核结果：r2 的三条现状描述有误

### 2.1 「地图 bake 会污染展示区」不成立

r2 §2.2 写：

> 地图 `STATIC_FALSE_HOOKS` 会在模板 bake 时对整树 `setPowered(false)`。共享可变材质会污染展示区。

复核：**全仓库零个模块级材质**。所有工厂材质都是 build 函数内的局部 `const`，例如：

```93:94:app/lib/map/fireStation.ts
  const glass = new THREE.MeshStandardMaterial({ color: 0x6fa5b0, emissive: 0x234853, emissiveIntensity: 0.1, roughness: 0.24, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide });
  const warmLight = new THREE.MeshStandardMaterial({ color: 0xffd89a, emissive: 0xffa13c, emissiveIntensity: 0.15, roughness: 0.3 });
```

地图通过 `cityCatalogSources.ts` 的 `adapter.build()` 拿到的是一棵全新的树、一批全新的材质对象。`callStaticHooks` 对它调 `setPowered(false)`（`cityTemplateCache.ts:186-196`）**物理上碰不到**展示区页面持有的那批材质。

这个污染只有在引入进程级 intern 表之后才会出现。r2 把它写成「现状问题」，等于用 Palette 会造成的风险来论证 Palette 的必要性。§4.1 的 WeakSet 所有权、§4.3 的 dispose 跳过、§2.3 的 clone 判定，全部是为了消化这个自造的风险。

**这不意味着这些机制设计得不对**——如果真做 intern，它们都是必需的。但它们是成本，不是收益。

### 2.2 贴图与纹理 refcount 章节没有对象

r2 §2.4 与 §4.3 围绕「共享贴图被误 dispose」「未来允许贴图 intern 必须加纹理 refcount」展开。实测 30 个工厂**没有任何一个材质带贴图**（`map` / `normalMap` / `roughnessMap` / … 全空）。

r2 §4.3 的「禁止贴图 intern，spec 含贴图则抛错」是一条**永远不会触发**的约束。保留一行断言即可，不需要专门章节和纹理策略。

（森林贴图、道路 stochastic 材质确实带贴图，但它们在 `textures.ts` / `shatterMorph.ts`，本稿非范围。）

### 2.3 `MeshPhysicalMaterial` 键覆盖不全 —— 属实，规模按身份是 12 个对象

r2 §2.5 属实：`cityTemplateCache.ts:332-386` 的 `materialBatchKey` 不含 `transmission` / `ior` / `thickness` / `clearcoat` / `clearcoatRoughness`，所以两块参数不同的物理玻璃会被并进同一个 pool。

规模必须分口径：30 个 adapter 全量构建后按**对象身份**是 **12** 个 `MeshPhysicalMaterial`；源码构造点更少（至少 shopping-mall、amusement-park、luxury-villa、residential-gate-premium）。禁止再写「6」而不标明是对象还是构造点。

这是真 bug（错误合池会改变视觉），但它是键补全，不需要 Palette 作为载体。提为 §4 的独立快修。§4 还要求：贴图 / 颜色 / 未列出的非默认 physical 字段必须进入键，否则直接拒绝合池。

### 2.4 r2 中复核为正确的部分

- §2.1「地图已经按值合池」——正确。`visualBatchCompatibilityKey` = `materialBatchKey` + layout + shadow + renderOrder，`getOrCreatePool(slot.poolKey)` 按字符串复用。intern 对 pool 数确实无增量收益。
- §2.3「`Material.clone()` 复制 `userData`」——正确。若真做 intern，所有权必须放 WeakSet 而不是 `userData`。
- §3「渲染可见性 ≠ 碰撞权威」——正确且严重，但它**不属于本稿**。已完整移交总稿 §9.1，本稿不再重复持有（见 §6）。

---

## 3. 拆出：静态合批的材质别名（独立 P1，与 Palette 无关）

这是修复前线上就存在的缺陷，不应排在 Palette 的迁移序列里。以下两段代码与风险描述保留作缺陷背景；现行实现结果见本节末尾。

`sceneInstanceBatch.ts:212-227` 对**所有** candidate 做 canonical 替换：

```220:226:app/lib/map/sceneInstanceBatch.ts
    const key = identityMaterials.has(object.material)
      ? `identity:${object.material.uuid}`
      : materialValueKey(object.material);
    const canonical = canonicalMaterials.get(key);
    if (canonical) object.material = canonical;
    else canonicalMaterials.set(key, object.material);
    candidates.push(object as THREE.Mesh<THREE.BufferGeometry, THREE.Material>);
```

而实际合并要到后面才发生，并且会跳过只有一个成员的 batch：

```262:263:app/lib/map/sceneInstanceBatch.ts
  for (const batch of pending.values()) {
    if (batch.meshes.length < 2) continue;
```

**后果**：按值别名的作用域**大于**合批作用域。即使某个网格最终没有被合并，它的材质也已经被换成了别人的对象。嵌套子模型（路灯、餐车、闸门的透镜）如果没有把可变材质冒泡到外层 `mutableMaterials` 白名单，就会与等值的静态材质别名成同一对象，夜景 hook 改一处会点亮另一处。

八个工厂都在传手工白名单，覆盖的都是顶层材质：

| 工厂 | `mutableMaterials` |
|---|---|
| fire-station | `glass, warmLight, fireRed, water, alertMaterial, ...alertBeaconMaterials` |
| city-center | `glass, warmGlass, mapScreen, destinationBoard, water, fountainGlow, greenLamp, redLamp` |
| school-campus | `windowGlass, atriumGlass, warmLight, poolBlue` |
| …其余五个同构 | |

**修复（F2，与 Palette 无关）：**

只把 canonical 替换挪到合并循环**不够**。当前 pending batch key 用的是 `mesh.material.uuid`（`sceneInstanceBatch.ts:244-257`）。若 source 仍保持原材质对象，两个等值但不同对象的材质会进不同 pending batch，合批量下降。

正确做法：

1. pending key 使用「值键，或显式可变标记下的 identity 键」——**不要**用 uuid 做静态材质的分桶；
2. source mesh **保持原材质引用**，不要 `object.material = canonical`；
3. 只有生成 proxy 时才选择 canonical material（`new THREE.Mesh(merged, canonical)`）；
4. `meshes.length < 2` 的 batch 不创建 proxy，source 材质原样留下。

**不要写「自动识别 hook 闭包引用的材质」。** JS 闭包不可反射。所谓方案 B 只是工厂给可变材质打 **显式标记** `material.userData.cityMutableMaterial = true`（材质自身的 userData，不是 mesh 的）。合批器读该标记走 identity 键。文档里不要再叫「自动识别」。

**F2 必须在同一个 P1 变更里完成生产标记迁移。** 当前仓库没有任何 `cityMutableMaterial` 标记，只有八个调用点传顶层 `mutableMaterials` 白名单。如果只让合批器“认识标记”，把真正的工厂标记留到 P2，现存缺陷不会被修复。因此 F2 同时包含：

1. 审计八个 `createOptimizedStaticSceneBatch` 工厂的 `setPowered` / 夜景 / 告警 / 相位等 hook，找出 hook 直接或间接修改的全部材质，包括嵌套路灯、餐车、闸门透镜；
2. 在材质创建处显式写 `cityMutableMaterial = true`，不得靠闭包反射或名称正则；
3. 过渡期 identity 判定为 `mutableMaterials.includes(material) || material.userData.cityMutableMaterial === true`，先保留手工白名单；
4. F2 回归覆盖生产 factory 后，才允许后续清理白名单。

**回归测试**：除合成嵌套 fixture 外，八个真实工厂必须逐一构建；对每个 hook 变更前后采集 material state，所有发生变化的材质都必须带显式标记并保持 source identity。构造与它等值的静态材质，断言合批后二者 `!==`，改动其一不影响其二；同时断言等值静态材质的 proxy 数不上升。

**2026-08-21 F2 已完成：**

- `sceneInstanceBatch.ts` 的 pending 分桶改为安全值键 / 显式 identity 键；candidate 阶段不再改写 `object.material`，只有 proxy 使用该值键的 canonical representative；
- 新增 `markCityMutableMaterials()`，八个生产调用点在传入兼容白名单时显式标记顶层材质；路灯、园林路灯、餐车、热狗亭、报刊亭、电话亭和交通信号灯在各自材质创建处标记闭包实际修改的材质；
- `city-material-mutable-hooks.test.mjs` 逐一构建八个生产工厂，对 `setPowered`、告警、事件、市场、交通相位及更新 hook 做 material state 差分；8/8 均证明所有变化材质已标记，mesh 的 source material 引用不被替换；
- 合成回归同时覆盖手工白名单与显式标记两条 identity 路径，并锁定两个等值静态 source 仍保留不同对象、只生成一个 canonical proxy batch；
- 显式标记使此前被错误静态合并的动态灯具 source 恢复独立渲染，32 模板合计 post-optimization / map mesh 均增加 **134**（10,545→10,679；7,531→7,665），但 triangles、material-key 与碰撞五元组不变；这是纠正状态串扰的已审核成本，不是性能回退误差；
- 八工厂当前 proxy batch 数已精确锁定为 amusement 126、school 89、mall 268、fire 83、park 179、sports 122、city 171、town 149，后续变化必须显式复核。

---

## 4. 快修：`materialBatchKey` 的 physical 字段覆盖（独立，可立即做）

`cityTemplateCache.ts:332-386` 的 `materialBatchKey` 按 `material.type` 起头，但后面只读 standard/phong 系字段。`sceneInstanceBatch.ts:73` 的 `materialValueKey` 是另一份独立实现。**F1 不再手工同步两份实现**：立即抽出共用 `encodeCityMaterialBatchKey(material): string | null`，两条路径只包装结果；`null` 必须转换为 `identity:${material.uuid}` 分桶，不能作为同一个空键合并。否则 F1 修完后到 P2 的 encoder 合并之间仍会漂移。

对 `MeshPhysicalMaterial`：

- 数值：`transmission`、`ior`、`thickness`、`clearcoat`、`clearcoatRoughness`、`iridescence`、`sheen`、`specularIntensity`；
- 颜色：`attenuationColor`、`sheenColor`、`specularColor`（用 `getHex()`，不用 `| 0`）；
- 贴图：`transmissionMap`、`thicknessMap`、`clearcoatMap`、`clearcoatNormalMap`、`clearcoatRoughnessMap`、`sheenColorMap`、`sheenRoughnessMap`、`iridescenceMap`、`specularIntensityMap`、`specularColorMap`（按 texture uuid，与现有 map/normalMap 一致）；
- **未编码且非默认的字段直接拒绝合池**（抛错或退回 identity），不要 silently 丢掉 `anisotropy`、`attenuationDistance` 等。

“未编码且非默认”必须可执行，不能写成笼统反射：

- 为锁定的 three 0.178 建立显式 `PHYSICAL_PROPERTY_MANIFEST`，覆盖 MeshPhysical + 继承的 MeshStandard/Material 渲染字段；测试把它与该版本公开属性/访问器清单对照，升级 three 时缺项直接失败；
- 默认值来自一次只读的 `new THREE.MeshPhysicalMaterial()` baseline，但 encoder 读取公开属性名（`clearcoat` / `transmission` / `anisotropy`），不得把 `_clearcoat` / `_transmission` 等内部 backing key 当 API；
- manifest 中已编码字段写入 key；未编码字段只要与 baseline 不等，就返回 `null` 走 identity（或在测试/开发态抛错）；Color/Vector/数组按值比较，Texture 按 uuid；
- `customProgramCacheKey()` 不能替代 render-state 字段。base Material 的 stencil、polygonOffset、colorWrite、depthFunc、blend 参数等若非默认且未编码，同样必须回退 identity。

约束：

- 追加字段只在 physical 分支生效，**不得改变现有 standard 材质的键字符串**，否则 §2.0 重锁后的 pool 基线会漂移；
- 两个调用方对所有受支持材质必须返回完全相同的 key/null；未知 class 默认 `null`/identity；
- 验收：构造两个只有 `transmission` 不同的 `MeshPhysicalMaterial`，断言键不相等、`getOrCreatePool` 产生两个池；一个带非默认未编码字段的样本不得与默认样本合池；`clearcoat` / `transmission` 的 accessor/backing 实现不能导致误拒绝或漏判。

**2026-08-21 F1 实施状态（已完成）：**

- 新增 `cityMaterialBatchKey.ts`，由 `cityTemplateCache.ts` 与 `sceneInstanceBatch.ts` 共用同一 encoder；不支持的类型或未编码的非默认 physical 状态统一回退到 `identity:${material.uuid}`；
- three 0.178 的 `PHYSICAL_PROPERTY_MANIFEST` 与公开属性/访问器清单做精确回归；physical 的 transmission、clearcoat、sheen、iridescence、attenuation、specular、anisotropy 及关联贴图/颜色均进入安全判定；
- Standard 旧键保持 byte-exact；全部 catalog 工厂的受支持材质都能安全编码；两个仅 physical 参数不同的材质不会合池；
- R5 全 catalog 三阶段探针已复用该 encoder，避免模板缓存与展示区静态合批继续产生两套材质口径。

这条与 Palette 解耦；F1 已闭合，但 §3 的 F2 仍是独立 P1，不能据此宣称材质所有权问题已经解决。

---

## 5. 延后：所有权语义与 intern（P2，R9）

如果将来确实要做 intern（例如 instance tint 归并需要稳定的白底材质集合），r2 的 API 设计基本可用。下面只记录相对 r2 的修订点。

### 5.1 与 geometry cache 共用 owner 判定

总稿把 primitive geometry cache 提为 P0。它同样需要「dispose 时跳过 cache 持有的对象」。**不要建两套基础设施**，也不要只改 `cityTemplateCache.disposeObjectResources`：

```ts
const cacheOwned = new WeakSet<THREE.BufferGeometry | THREE.Material>();
```

全仓库 `disposeSceneResources`（总稿 §9.9）统一跳过 `cacheOwned`。**该前置已随 R3 落地**：geometry cache、catalog/template、`ForestScene`、demo 与 fixture 共用同一判定；Vite HMR/registry replacement 采用 generation retirement，live scene 未释放前不 dispose 旧 generation；测试 reset 在 borrower=0 后替换 WeakSet。Palette 后续只扩展 Material 的 cache ownership，不再复制一套表或生命周期。

### 5.2 API（相对 r2 的删减）

```ts
export type CityMaterialOwnership = "interned" | "mutable" | "unmanaged";

export type StandardMaterialSpec = Readonly<{
  type?: "standard" | "physical" | "basic";
  color: number;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  opacity?: number;
  transparent?: boolean;
  depthWrite?: boolean;
  side?: THREE.Side;
  vertexColors?: boolean;
  flatShading?: boolean;
  // 仅 type==="physical" 时进入键
  transmission?: number;
  ior?: number;
  thickness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
}>;
```

保留 r2 的 `standard` / `physical` / `basic` / `mutable` / `mutablePhysical` / `isInterned` / `isMutable` / `ownershipOf` / `canonicalKey` / `stats`。

**删除**：`disposeSceneMaterials`（并入 §5.1 的统一 owner 判定，不单独出一个 API）。

**贴图**：保留一行断言「spec 不接受贴图字段」，删除 r2 §2.4 / §4.3 的纹理释放策略与 refcount 铺垫（当前 0 个带贴图材质）。若将来引入带贴图的城市材质，再单开设计。

### 5.3 所有权：WeakSet 为准，`userData` 仅诊断

沿用 r2 §4.1，不变：

- `isInterned` / `isMutable` / `ownershipOf` 只查 WeakSet；
- 任何 clone（破碎、相位、`storefrontGlass.clone()`）都不得被判为 intern，进入 unmanaged 或显式再 `mutable()`；
- 合批器对 `isMutable(material) === true` 使用 identity key；interned 按值合并是正确的。

### 5.4 键

沿用 r2 §4.2（结构化 tuple + 长度前缀、颜色用 `Color.getHex()`、拒绝 NaN/Infinity）。**未知 class 默认 identity，不要强制按值合并。**

`ShaderMaterial`、未来自定义材质的 uniform、defines、shader 源码、纹理和回调无法通过「剩余字段稳定序列化」判断渲染等价。强制按值会把不相等的程序并进同一批。

因此：

- 对明确支持的 `MeshStandardMaterial` / `MeshPhysicalMaterial` / `MeshPhongMaterial` / `MeshBasicMaterial` 分别实现完整 encoder；
- 未知类型 `canonicalKey` 返回 `null`，合批器走 **identity**；
- 「batch 数不得上升」只约束当前受支持的材质类型。现有 `materialValueKey` 对未知类型按残缺字段合并，本身就不安全；迁移时允许这些未知类型的 batch 数变化，但必须在测试里点名列出，不得 silently 把 ShaderMaterial 并进去；
- 受支持类型迁移前后每工厂 batch 数不得上升。

---

## 6. 已移交总稿的内容

r2 §3「渲染可见性与碰撞权威分离」及其验收，本稿不再持有，完整版见总稿 §9.1。理由：它是所有合批工作的 P0，与材质无关，放在 Palette 稿里会让它随 Palette 一起被降级。

r2 §6 迁移表中的 P0-度量、P0-碰撞已移交总稿 §2.0、§9.1；P0-dispose 并入总稿 R3 的 geometry cache（§5.1）。

---

## 7. 修订后的排期

| 序 | 内容 | 定级 | 依赖 |
|---|---|---|---|
| **F1（已完成）** | 抽出共用安全 encoder；补 physical 字段与默认 manifest；未知/未支持状态 identity；两调用方 parity 测试 | P1，独立 | 无 |
| **F2（已完成）** | 静态合批：pending 用值键；source 保持原材质；仅 proxy 用 canonical；**同轮审计并标记八个生产工厂全部 hook 可变材质** | P1，独立 | F1 的共用 encoder |
| **F3（已完成）** | 统一 `cacheOwned` + 全仓库 `disposeSceneResources`（含全部 demo） | 随总稿 R3 | 无 |
| **F4** | Palette 的结构化 tuple/canonicalKey 复用 F1 encoder 语义，不再另起一份字段表 | P2 | F1 |
| **F5** | Palette 模块 + 所有权 / 键 / dispose 事件测试 | P2 | F3、F4 |
| **F6** | 工厂迁移 `standard()` / `mutable()` | P2 | F5 + 总稿 §9.1 绿 |
| **F7** | 在 F2 的真实工厂标记回归持续守护下，移除手工 `mutableMaterials` 兼容白名单 | P2 清理 | F2、F5 |

F1 已随总稿 R5 闭合，F2 也已连同真实工厂标记与回归一起闭合。F5 之后才谈 Palette 工厂迁移；基于收益评估，当前不安排 F4–F7。

---

## 8. 验收（修订）

**F1 / F2（P1，均已通过）的硬性验收：**

- 两个只有 `transmission` 不同的 physical 材质产生不同 `materialBatchKey`，`getOrCreatePool` 产生两个池；
- 一个带非默认未编码 physical 字段的样本不得与默认样本合池（拒绝或 identity）；
- 补全后**现有 standard 材质的键字符串不变**（快照测试）；
- `materialBatchKey` 与 `materialValueKey` 对全部受支持样本的 key/null 完全一致；three 版本的 physical 属性/访问器清单超出 manifest 时测试失败；
- 嵌套可变材质与等值静态材质在合批后 `!==`，改动其一不影响其二；
- 等值静态材质的 proxy / batch 数不因 F2 下降（pending 必须用值键而不是 uuid）；
- 八个静态合批工厂中，每个 hook 实际改变的材质都带 `cityMutableMaterial`，source 引用不被 canonical 替换；
- 过渡期手工 `mutableMaterials` 与显式标记任一命中都走 identity；八个工厂中**受支持材质类型**的 batch 数不上升。

**F5 / F6（P2，若届时仍决定做）：**

- intern 引用相等；mutable 引用不相等且改 `emissiveIntensity` 隔离；
- `isInterned(clone) === false`；
- intern 的 `dispose` 事件次数为 0，mutable 恰好 1（用 `material.addEventListener("dispose", …)` 计数，不用「dispose 后 `material.type` 仍在」判定）；
- 不合规颜色 / NaN 抛错；
- 合批器对带显式 `cityMutableMaterial` 标记的透镜使用 identity；F7 移除手工白名单后上述八个真实 factory 回归仍通过；
- 受支持类型迁移前后每工厂 batch 数不上升。未知类型允许 identity，测试必须点名列出。

**明确不作为验收：**

- 材质对象数下降（上限只有 567，且不是瓶颈）；
- catalog pool 数下降（地图已按值合池）；
- shader program 数下降（three 按 shader 参数缓存，不按材质对象身份）；
- draw call / effective range 下降（那是合批与可见集的指标）。

---

## 9. 与性能总稿的关系

总稿拥有：度量口径重锁（range + triangle + backend 参数化）、碰撞与渲染可见性分离、**primitive geometry cache（P0）**、BatchedMesh 包围球、可见集与阴影相机对齐、展示区渲染预算覆盖、mapLod 三阶段指标、阴影拆分、far LOD、拾取宽相、空间分布 fixture。

本稿只拥有材质所有权语义与材质键。

规模对照，供排期时参考：materials 1,022 个对象（intern 上限 −567）vs geometry 57,284 个对象（`residential-community` 单工厂 8.08 MB → 2.86 MB）。**先做几何。**
