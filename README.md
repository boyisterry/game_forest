# 林间速递 · 地图工坊

基于 Three.js 的程序化森林与城市骑行游戏原型。项目包含双地图工坊、区块流式加载、兔子摩托骑行、碰撞反馈，以及树木真实碎裂与修复特效。

## 当前能力

- 可在「深林地图」和「雨港新城」之间即时切换，两张地图共用骑行、碰撞、镜头和音频系统
- 约 3200 × 3200 的不规则世界，道路纵贯全图
- 西侧、南侧连续河流与沙岸，北侧、东侧多层山脊封边
- 以镜头或骑手为中心的 chunk 流式加载与卸载
- 左下角小地图展示路线、配送点和当前位置，工坊模式下可点击跳转
- 可调森林密度、道路宽度、道路弯曲度、晨雾、配送站点和树木参数
- 新绿、盛夏、金秋三套季节色谱
- 正常树 GLB 批量实例化；旧破碎风格的灌木、树桩和倒枝不进入地图
- 草地、泥路、树皮和石头使用程序化 PBR 贴图；地图只生成大石头与超级大石头
- 破碎模式会同步炸开树木和石头；每块石头使用 92 块、828 面的低模悬浮碎石并可反向重组
- 骑行小地图使用方向箭头显示实际移动方向，包含漂移方向与倒车反向
- 东侧和北侧边缘使用带岩层台阶、法线/粗糙度细节及大型岩块断面的岩石山体
- 兔子摩托骑行、加速、刹车、漂移、树木和石头碰撞
- 地图配置 JSON 导入与导出

## 雨港新城

城市地图是一张独立的平坦驾驶地图，包含老城区、中央商业区、港口工业区、滨海大道和山坡住宅区五种建筑分区。主干道路组成完整配送环线，并提供：

- 程序化建筑密度、机动车道宽度和配送点调节
- 晴天光照、干燥路面、车道线、连续街灯、行道树和滨海护栏
- 独立机动车道、双向非机动车道、抬高一格的人行道、过街斑马线和路口坡道
- 带基座、入口雨棚、窗格、檐口与屋顶设备的建筑立面，以及独立的城市小地图
- 建筑、行道树、配送信标和海岸边界碰撞
- 建筑、窗灯、路灯和道路标线的批量实例化渲染

## 树木碎裂与修复

实际地图已经接入与树特效 Demo 相同的双模型效果：

- 修复态使用 `tree_normal_*.glb` 正常树模型
- 碎裂态使用对应的旧树 GLB 作为真实木质和叶片碎片来源
- 木质碎片空间分组减少 30%，保留的木质碎片放大 20%
- 单棵树的碎片扩散位移在聚团版本基础上放大 50%
- 碎片的位移、旋转、缩放和错峰动画由 GPU 顶点动画完成
- 地图仍通过 `InstancedMesh` 批量渲染树木，避免为每块碎片创建独立 Mesh
- 新流式加载的 chunk 会自动继承当前碎裂或修复状态
- 碎裂模式默认关闭，可通过地图工具栏的 `Shatter on / Shatter off` 切换

正常树与碎裂树的对应关系记录在：

```text
public/models/forest/manifest.json
  tree_large / tree_medium / tree_small
  tree_shattered_large / tree_shattered_medium / tree_shattered_small
```

## 本地运行

```bash
npm install
npm run dev
```

打开：

- 实际地图：<http://localhost:3000/>
- 单树碎裂与修复 Demo：<http://localhost:3000/demos/shatter-morph-tree.html>
- 石头磨碎与重组 Demo：<http://localhost:3000/demos/stone-grind.html>
- 城市树木、路灯、红绿灯、流动餐车、街边亭、长条花坛、居民楼与小别墅正常/破碎双版本展厅：<http://localhost:3000/demos/city-street-furniture>

执行构建和全部测试：

```bash
npm test
```

## 操作

### 地图工坊

- 拖拽：旋转镜头
- 滚轮：缩放镜头
- 点击小地图：跳转观察位置
- `Shatter on / off`：炸裂或修复地图中的树木
- `Play`：进入骑行模式

### 骑行模式

- `W / S`：前进、刹车与倒车
- `A / D`：转向
- `Shift`：加速
- `Space`：手刹；达到速度后配合转向可漂移

## 主要结构

```text
app/
  components/MapStudio.tsx     编辑器、模式切换与地图交互
  lib/map/ForestScene.ts       场景编排、灯光、骑手与动画循环
  lib/map/ChunkManager.ts      chunk 流式加载、卸载和特效状态同步
  lib/map/forestAssets.ts      共享材质、实例化树林和碰撞物建造
  lib/map/treeModels.ts        GLB 加载、正常/碎裂树配对和碎片预处理
  lib/map/shatterMorph.ts      树木炸裂/修复控制器与 GPU 顶点动画
  lib/map/motorcycle.ts        摩托运动、加速、刹车与漂移
  lib/map/collision.ts         树木、石头和边界碰撞
  lib/map/boundaryTerrain.ts   河岸与山脊高度、坡度和速度限制
  lib/map/world.ts             世界尺度、道路和 chunk 坐标
  lib/map/Minimap.ts           2D 小地图
  lib/map/textures.ts          程序化地表、树皮和石头贴图
public/
  demos/                       独立视觉效果 Demo
  models/forest/               Web 端 GLB 与模型清单
scripts/
  generate-normal-trees.mjs    可重复生成正常树 GLB
tests/                         地图、车辆、边界、音频与树特效测试
```

## 模型说明

正常树 GLB 由项目脚本生成，并与旧破碎树资源分组保存。地图启动时加载两套树几何：正常模型负责完整树形，破碎模型只用于生成碎片端态。碎片数据在加载阶段按空间分桶并写入几何属性，运行时通过共享材质统一驱动，因此能够在大规模森林中使用相同效果。

原始高精度模型保存在 `work/source-models/`，Web 模型保存在 `public/models/forest/`，便于后续针对不同平台重新生成 LOD。
