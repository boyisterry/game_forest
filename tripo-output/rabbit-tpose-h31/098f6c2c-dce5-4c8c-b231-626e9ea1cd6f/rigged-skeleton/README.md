# 人形小兔 Rig Demo

基于 Tripo 官方 **biped 预设动画重定向**（idle / walk / run / jump）的可操作小兔场景。

## 启动

```bash
./serve.sh
# → http://127.0.0.1:5188/
```

## 操作

| 键 | 作用 |
|----|------|
| WASD / 方向键 | 移动 |
| 鼠标 | 转动视角（点击画布锁定） |
| Shift | 奔跑 |
| Space | 跳跃 |
| F | 全屏 |
| H | 显示骨架 |

## 动画方案

1. 源网格重新绑骨为 **Tripo biped**（Mixamo 命名不支持 retarget）。
2. Tripo `animations/retarget` 烘焙 `preset:biped:idle|walk|run|jump`，`animate_in_place: true`。
3. Demo 用 `AnimationMixer` 按操作意图切换：松键 idle、移动 walk、Shift + 移动 run、Space jump；速度只微调步频，不再决定动画类型。
4. 播放速率随速度微调，落地后用脚尖高度贴地。

参考：Tripo 动画文档、Unity Mecanim blend-tree 实践、生物运动学对角步态（trot）由预设 clip 内建。

## 主要文件

- `rabbit_animated_locomotion.glb` — 带四段动画的可动模型
- `demo.js` / `index.html` / `demo.css`
- `anim_meta.json` — retarget 任务记录
- `tripo-rig/` — Tripo 规范骨架中间产物
