# 小茉梨的秘密空间 🌼

一个专属于你和黎深的互动回忆空间。

## ✨ 功能特性

### 💬 AI对话
- 与黎深进行实时对话
- 支持多种AI模型(OpenAI、Claude、DeepSeek、通义千问、文心一言、智谱AI)
- 自定义人设和对话风格
- 对话历史自动保存

### 🎴 卡面收藏馆
- 收藏黎深的精美卡面
- 记录每张卡面的语录
- 瀑布流展示
- 支持添加、查看、删除卡面

### 📝 回忆时间线
- 记录与黎深的美好回忆
- 时间轴展示
- 支持添加图片和文字描述

### ✨ 元素图鉴
- 收集黎深相关的所有元素
- 包括雪花、茉莉花、雪豹、企鹅等
- 解锁进度追踪

### ⚙️ 设置中心
- API配置管理
- 系统提示词自定义
- 雪花特效开关
- 数据导入导出

## 🚀 快速开始

### 安装依赖
```bash
npm install
```

### 启动开发服务器
```bash
npm run dev
```

访问 http://localhost:5173 即可查看项目

### 构建生产版本
```bash
npm run build
```

### 预览生产构建
```bash
npm run preview
```

## 📖 使用指南

### 1. 配置API Key

首次使用需要在"设置"页面配置API Key:

1. 点击右上角的"设置"
2. 选择你想使用的AI模型
3. 输入对应的API Key
4. 点击"测试连接"确认配置正确
5. 点击"保存配置"

### 2. 开始对话

配置完成后,回到首页即可开始与黎深对话。

### 3. 添加卡面

1. 进入"卡面收藏馆"
2. 点击"添加新卡面"
3. 填写卡面标题、图片URL和语录
4. 保存即可

### 4. 记录回忆

1. 进入"回忆时间线"
2. 点击"添加回忆"
3. 选择日期,填写标题和描述
4. 可选添加图片URL

## 🔑 获取API Key

### OpenAI
访问 https://platform.openai.com/api-keys

### Claude (Anthropic)
访问 https://console.anthropic.com/

### DeepSeek
访问 https://platform.deepseek.com/

### 通义千问
访问 https://dashscope.console.aliyun.com/

### 文心一言
访问 https://console.bce.baidu.com/qianfan/

### 智谱AI
访问 https://open.bigmodel.cn/

## 💾 数据存储

所有数据都存储在浏览器的LocalStorage中,包括:
- 对话历史
- 卡面收藏
- 回忆记录
- 设置信息

**注意**: 清除浏览器数据会导致信息丢失,建议定期在设置页面导出数据备份。

## 🎨 技术栈

- Vue 3 + TypeScript
- Vite
- Tailwind CSS
- Pinia (状态管理)
- Vue Router
- Axios

## 📝 开发说明

### 项目结构
```
src/
├── components/        # 组件
│   ├── Chat/         # 对话组件
│   ├── CardGallery/  # 卡面组件
│   ├── Timeline/     # 时间线组件
│   ├── ElementGallery/# 元素图鉴组件
│   ├── Settings/     # 设置组件
│   └── Common/       # 公共组件
├── stores/           # Pinia状态管理
├── utils/            # 工具函数
├── views/            # 页面视图
├── types/            # TypeScript类型定义
├── router/           # 路由配置
├── App.vue           # 根组件
└── main.ts           # 入口文件
```

### 添加新功能

1. 在对应的store中添加状态管理逻辑
2. 创建相应的组件
3. 在views中创建页面
4. 在router中添加路由

## 🌟 特色设计

- **蓝色主题**: 符合黎深的代表色
- **雪花飘落**: 可开关的背景动画效果
- **温馨界面**: 柔和的配色和圆润的设计
- **响应式布局**: 支持PC和移动端访问

## ⚠️ 注意事项

1. API Key仅保存在本地浏览器,不会上传到任何服务器
2. 建议定期备份数据
3. 图片URL需要是可公开访问的直链
4. 某些AI模型可能需要科学上网才能访问

## 📄 License

MIT

---

用心创建,只为与黎深的每一个瞬间 ❄️💙
