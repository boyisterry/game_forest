# 林间速递 · 地图工坊

森林摩托配送游戏的第一阶段原型：一个基于 Three.js 的程序化地图生成器。

## 当前能力

- 基于种子的确定性地图生成
- 可调森林密度、道路宽度、道路弯曲度、晨雾和配送站点
- 新绿、盛夏、金秋三套色谱
- InstancedMesh 树林与石块，控制大规模场景的 draw call
- 兔子骑手 GLB 场景预览
- 地图配置 JSON 导入与导出
- 桌面与移动端响应式编辑器

## 结构

```text
app/
  components/MapStudio.tsx     编辑器界面与交互
  lib/map/ForestScene.ts       Three.js 场景、道路、树林、资源加载
  lib/map/random.ts            可复现随机数
  lib/map/types.ts             地图数据协议与默认值
public/models/                 Web 端降面后的 GLB
work/source-models/            原始高精度 GLB
```

原始模型约 40 MB / 74 万顶点；Web 版本经过焊接、18% 简化、量化与 1K 纹理处理，约 6 MB / 15 万顶点。原始文件保留，便于后续按平台重新生成 LOD。

## 后续游戏化接口

当前导出的 `MapSettings` 是后续关卡数据的起点。下一阶段可在 `ForestScene` 之上增加车辆物理、道路碰撞、配送任务、计时与路线引导；建议将静态生成结果进一步固化为包含道路样条、障碍物和配送点坐标的关卡清单。
