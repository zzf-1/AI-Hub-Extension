# AI Hub TurboWarp Extension - 技术规范

## 1. 项目概述

**项目名称**: AI Hub
**项目类型**: TurboWarp 扩展插件
**核心功能**: 在 Scratch/TurboWarp 中集成多种 AI 服务（DeepSeek、OpenAI GPT、Claude、MiniMax），支持与 AI 角色进行自然语言对话
**目标用户**: Scratch 创作者、教育工作者、游戏开发者

## 2. 功能架构

### 2.1 核心模块

```
┌─────────────────────────────────────────────────────────┐
│                     AI Hub 扩展                          │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  配置面板    │  │  角色管理    │  │  对话引擎   │     │
│  │             │  │             │  │             │     │
│  │ - AI服务选择 │  │ - 创建角色   │  │ - 同步对话  │     │
│  │ - API密钥   │  │ - 角色属性   │  │ - 异步对话  │     │
│  │ - 模型选择   │  │ - 说话风格   │  │ - 响应事件  │     │
│  │             │  │ - 任务设定   │  │ - 历史管理  │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
├─────────────────────────────────────────────────────────┤
│                    AI 适配层                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐│
│  │ DeepSeek │  │ OpenAI   │  │ Claude   │  │ MiniMax  ││
│  │ Adapter  │  │ Adapter  │  │ Adapter  │  │ Adapter  ││
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘│
└─────────────────────────────────────────────────────────┘
```

### 2.2 支持的 AI 服务

| AI 服务 | API 方式 | 需要密钥 | 默认模型 |
|---------|----------|----------|----------|
| DeepSeek | REST API | 是 | deepseek-chat |
| OpenAI | REST API | 是 | gpt-3.5-turbo |
| Claude | REST API | 是 | claude-3-haiku |
| MiniMax | REST API | 是 | abab6-chat |

### 2.3 数据结构

```typescript
// AI 角色配置
interface AICharacter {
  id: string;           // 唯一标识
  name: string;         // 角色名称
  personality: string;   // 个性描述
  speakingStyle: string; // 说话风格
  task: string;         // 任务描述
  background: string;   // 背景信息
}

// 对话消息
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// 对话历史 (按角色存储)
interface ChatHistory {
  characterId: string;
  messages: ChatMessage[];
}
```

## 3. 积木设计

### 3.1 配置类积木

| 积木名称 | 参数 | 功能 |
|---------|------|------|
| 设置AI服务 | [服务类型: dropdown] | 选择 DeepSeek / OpenAI / Claude / MiniMax |
| 设置API密钥 | [密钥: string] | 设置 AI 服务的 API 密钥 |
| 选择AI模型 | [模型: dropdown] | 选择具体模型 |
| 设置聊天语言 | [语言: string] | 设置 AI 回复的语言 |

### 3.2 角色管理积木

| 积木名称 | 参数 | 功能 |
|---------|------|------|
| 创建AI角色 | [名字, 个性, 风格, 任务] | 创建新角色 |
| 设置角色背景 | [角色名, 背景] | 设置角色专属背景 |
| 删除AI角色 | [角色名] | 删除角色及其历史 |
| 清空角色历史 | [角色名] | 清空对话历史 |

### 3.3 对话类积木

| 积木名称 | 参数 | 功能 | 返回 |
|---------|------|------|------|
| 对话 | [角色名, 消息] | 同步对话，等待响应 | AI 回复 |
| 发送消息 | [角色名, 消息, 事件ID] | 异步发送，不等待 | - |
| 当收到AI响应 | - | 帽子块，响应时触发 | 角色名、回复、事件ID |

### 3.4 游戏背景积木

| 积木名称 | 参数 | 功能 |
|---------|------|------|
| 设置游戏背景 | [背景描述] | 设置所有角色共享的世界观 |
| 设置玩家信息 | [名字, 身份, 背景] | 设置玩家角色信息 |

## 4. 技术实现

### 4.1 扩展结构

```javascript
// 扩展类定义
class AIHubExtension {
  constructor() {
    this.adapters = {
      'deepseek': new DeepSeekAdapter(),
      'openai': new OpenAIAdapter(),
      'claude': new ClaudeAdapter(),
      'minimax': new MiniMaxAdapter()
    };

    this.characters = new Map();     // 角色存储
    this.histories = new Map();      // 对话历史
    this.settings = {                // 配置
      provider: 'deepseek',
      apiKey: '',
      model: 'deepseek-chat',
      language: '中文',
      gameBackground: '',
      playerInfo: { name: '', identity: '', background: '' }
    };
  }

  getInfo() { /* 返回积木定义 */ }
  // 各积木实现...
}
```

### 4.2 AI 适配器接口

```typescript
interface AIAdapter {
  name: string;
  defaultModel: string;
  models: string[];

  getEndpoint(): string;
  buildHeaders(apiKey: string): Record<string, string>;
  buildMessages(systemPrompt: string, history: ChatMessage[], userMessage: string): any[];
  buildBody(model: string, messages: any[]): any;
  parseResponse(data: any): string;
  getErrorMessage(error: any): string;
}
```

### 4.3 网络请求

- 使用 `Scratch.fetch()` 进行 API 请求
- 所有 AI 服务均通过 REST API 调用
- 异步请求支持错误处理

### 4.4 Prompt 构建策略

```
System Prompt = 游戏背景 + 玩家信息 + 角色设定 + 对话历史
```

## 5. 用户界面

### 5.1 配置流程

1. 用户选择 AI 服务商
2. 输入 API 密钥
3. 选择模型
4. 创建 AI 角色
5. 开始对话

### 5.2 错误处理

| 错误类型 | 处理方式 |
|---------|----------|
| API Key 无效 | 提示用户检查密钥 |
| 网络超时 | 返回"网络超时，请重试" |
| 服务不可用 | 返回"AI 服务暂时不可用" |
| 角色不存在 | 返回"未找到该角色" |

## 6. 安全考虑

- API 密钥存储在本地（浏览器 localStorage）
- 不上传项目数据到第三方服务器
- 使用 Scratch.fetch() 符合 TurboWarp 安全规范

## 7. 部署方式

### 7.1 本地开发
```
1. 克隆 TurboWarp extensions 仓库
2. 在 extensions/ 目录创建 ai-hub.js
3. 本地开发服务器测试
```

### 7.2 最终用户使用
```
1. 打开 TurboWarp 编辑器
2. 添加扩展 -> 导入插件
3. 选择 ai-hub.js 文件
```

## 8. 扩展性

- 支持后续添加更多 AI 服务商
- 角色配置可序列化和反序列化
- 支持导入/导出角色配置
