# 林间速递 · 地图工坊

森林摩托配送游戏的第一阶段原型：一个基于 Three.js 的程序化地图生成器。

## 当前能力

- 约 3200 × 3200 的不规则方形世界，道路纵贯全图
- 地理封边：西侧与南侧为连续河流，北侧与东侧为多层山脊
- 区块流式加载：只生成镜头附近 chunk，远离后卸载；全图低成本远景地面底板填补未加载空隙
- 保持 Web 性能
- 左下角小地图：全图路线、配送点、已加载区块；点击可跳跃镜头
- 树高分档：灌木 / 成树 / 少量地标大树
- 基于种子的确定性地图生成
- 可调森林密度、道路宽度、道路弯曲度、晨雾和配送站点
- 新绿、盛夏、金秋三套色谱
- gpt_demo 风格阔叶树 + InstancedMesh；树木参数可微调
- 兔子骑手 GLB 场景预览
- 地图配置 JSON 导入与导出

## 结构

```text
app/
  components/MapStudio.tsx     编辑器界面与交互
  lib/map/ForestScene.ts       场景编排、灯光、骑手、小地图接入
  lib/map/world.ts             世界尺度、道路、chunk 坐标与索引
  lib/map/boundaries.ts        不规则边界、河流与山脊生成
  lib/map/ChunkManager.ts      流式加载 / 卸载
  lib/map/forestAssets.ts      共享材质几何 + 单 chunk 树林建造
  lib/map/Minimap.ts           2D 小地图
  lib/map/tree.ts              树形描述工厂
  lib/map/textures.ts          程序化贴图
  lib/map/random.ts / types.ts
public/models/                 Web 端降面后的 GLB
work/source-models/            原始高精度 GLB
```

原始模型约 40 MB / 74 万顶点；Web 版本经过焊接、18% 简化、量化与 1K 纹理处理，约 6 MB / 15 万顶点。原始文件保留，便于后续按平台重新生成 LOD。

## 后续游戏化接口

当前导出的 `MapSettings` 是后续关卡数据的起点。下一阶段可在 `ForestScene` 之上增加车辆物理、道路碰撞、配送任务、计时与路线引导；建议将静态生成结果进一步固化为包含道路样条、障碍物和配送点坐标的关卡清单。
