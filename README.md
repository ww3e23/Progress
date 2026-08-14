# Progress · 现场施工进度

由 [CI 查验 App](https://github.com/ww3e23/CI) 复制而来，改成**工项 × 楼层 × 户 × 工序**的现场进度本。缺失挂在格子上，完成率自动汇总。

**与查验完全隔离：** 本机 key、Firebase、网址都分开，互不读写。

| | 查验 CI | 现场进度 Progress |
|---|---|---|
| 网址 | https://ww3e23.github.io/CI/ | https://ww3e23.github.io/Progress/ |
| Firebase | `ci-inspection` | `site-progress-app` |
| 本机帐号 | `ci-inspection-auth-v1` | `site-progress-auth-v1` |
| 本机资料 | `ci-inspection-data-v1` | `site-progress-data-v1` |

Firebase 设定见 [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md)。

## 现场怎么用

1. 首页先选工项（例如室内泥作），再选楼层，看到和 Excel 一样的户 × 工序矩阵
2. **点一下**格子轮转：未开始 → 施工中 → 完成
3. **长按**格子：拍照记进度、记缺失、卡关
4. 有未关闭缺失的格子不能标完成（自动变成「缺失改善中」）
5. 「按户」可看这一户所有工项

预设工项：止水墩（正向／背向）、室内泥作、室外泥作。可在「我的」增改。

## 开发

```bash
npm install
npm run dev
```
