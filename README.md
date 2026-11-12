# 独立旋转木马网页

这个目录是从原工程中提取出的独立项目，只包含旋转木马、悬挂照片、下雪效果、背景音乐和照片大图预览。

在线地址：<https://gatitosignal.github.io/forTianYu/>

## 运行

首次运行：

```powershell
npm install
npm run dev
```

浏览器打开 `http://127.0.0.1:5173/`。

## 更换照片

把照片放入 `public/photos/`，支持 JPG、JPEG、PNG 和 WebP。启动或构建时会自动更新照片清单。

可在 `src/data/photo-meta.json` 中按文件名添加标题、日期、说明和替代文本。

## 修改照片大小

编辑 `src/scenes/CarouselScene.js` 中的 `frameWidth` 和 `maxFrameHeight`。

## 构建

```powershell
npm test
npm run build
npm run preview
```

构建结果位于 `dist/`。

## GitHub Pages

推送到 `main` 分支后，`.github/workflows/pages.yml` 会自动测试、构建并部署网站。
