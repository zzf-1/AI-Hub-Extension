/**
 * AI Hub - TurboWarp 扩展 v3
 * 可选服务商：DeepSeek / Qwen / Pollinations
 * 支持模型版本选择
 */
(function (Scratch) {

// ==================== DeepSeek 适配器 ====================
class DeepSeekAdapter {
  constructor() {
    this.name = 'deepseek';
    this.models = ['deepseek-chat', 'deepseek-coder'];
    this.defaultModel = 'deepseek-chat';
  }

  getEndpoint() { return 'https://api.deepseek.com/v1/chat/completions'; }

  buildHeaders(apiKey) {
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
  }

  buildMessages(systemPrompt, history, userMessage) {
    const msgs = [];
    if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt });
    history.forEach(m => msgs.push({ role: m.role, content: m.content }));
    msgs.push({ role: 'user', content: userMessage });
    return msgs;
  }

  buildBody(model, messages) {
    return { model: model, messages, temperature: 0.8, max_tokens: 1000 };
  }

  parseResponse(data) {
    if (data.choices && data.choices[0]) return data.choices[0].message.content;
    throw new Error('响应格式错误');
  }

  getErrorMessage(error) {
    if (error.status === 401) return 'API 密钥无效';
    if (error.status === 429) return '请求太频繁';
    return error.message || '请求失败';
  }
}

// ==================== Qwen 适配器 ====================
class QwenAdapter {
  constructor() {
    this.name = 'qwen';
    this.models = ['qwen-vl-plus', 'qwen-max', 'qwen-turbo'];
    this.defaultModel = 'qwen-vl-plus';
  }

  // 聊天/视觉
  getChatEndpoint() { return 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'; }

  buildHeaders(apiKey) {
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
  }

  buildMessages(systemPrompt, history, userMessage) {
    const msgs = [];
    if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt });
    history.forEach(m => msgs.push({ role: m.role, content: m.content }));
    msgs.push({ role: 'user', content: userMessage });
    return msgs;
  }

  buildBody(model, messages) {
    return { model: model, messages, temperature: 0.8, max_tokens: 1000 };
  }

  parseResponse(data) {
    if (data.choices && data.choices[0]) return data.choices[0].message.content;
    throw new Error('响应格式错误');
  }

  // 图片生成
  getImageGenEndpoint() { return 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis'; }

  buildImageGenBody(prompt) {
    return { model: 'wanx-v1', input: { prompt }, parameters: { style: '<auto>', size: '1024*1024', n: 1 } };
  }

  async parseImageGenResponse(response) {
    const data = await response.json();
    if (data.output && data.output.task_id) {
      return { taskId: data.output.task_id, async: true };
    }
    if (data.output && data.output.results && data.output.results[0]) {
      return { url: data.output.results[0].url, async: false };
    }
    throw new Error(data.message || '生成失败');
  }

  // 图片识别
  buildVisionBody(model, imageUrl, question) {
    return {
      model: model,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl } },
          { type: 'text', text: question || '描述这张图片' }
        ]
      }]
    };
  }

  getErrorMessage(error) {
    if (error.status === 401) return 'API 密钥无效';
    if (error.status === 429) return '请求太频繁';
    return error.message || '请求失败';
  }
}

// ==================== Pollinations 适配器 ====================
class PollinationsAdapter {
  constructor() {
    this.name = 'pollinations';
    this.models = ['flux', 'turbo']; // 可选模型
    this.defaultModel = 'flux';
  }

  // Pollinations.ai：直接构造图片 URL，不需要 POST 请求
  buildImageUrl(prompt, model, width, height) {
    const encodedPrompt = encodeURIComponent(prompt);
    const seed = Math.floor(Math.random() * 1000000);
    let url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width || 1024}&height=${height || 1024}&seed=${seed}&nologo=true`;
    if (model && model !== 'flux') {
      url += `&model=${encodeURIComponent(model)}`;
    }
    return url;
  }
}

// ==================== 扩展主体 ====================
class AIHubExtension {
  constructor() {
    this.adapters = {
      'deepseek': new DeepSeekAdapter(),
      'qwen': new QwenAdapter(),
      'pollinations': new PollinationsAdapter()
    };

    this.settings = {
      provider: 'deepseek',
      apiKey: '',
      model: 'deepseek-chat',
      language: '中文',
      gameBackground: '',
      playerInfo: { name: '玩家', identity: '冒险者', background: '' }
    };

    this.characters = new Map();
    this.histories = new Map();
    this._loadSettings();
  }

  getInfo() {
    return {
      id: 'aihub',
      name: 'AI Hub',
      blocks: [
        // ===== 配置类积木 =====
        {
          opcode: 'setProvider',
          blockType: Scratch.BlockType.COMMAND,
          text: '设置AI服务为 [PROVIDER]',
          arguments: {
            PROVIDER: {
              type: Scratch.ArgumentType.STRING,
              menu: 'aiProvider'
            }
          }
        },
        {
          opcode: 'setApiKey',
          blockType: Scratch.BlockType.COMMAND,
          text: '设置API密钥为 [KEY]',
          arguments: {
            KEY: {
              type: Scratch.ArgumentType.STRING,
              defaultValue: ''
            }
          }
        },
        {
          opcode: 'setModel',
          blockType: Scratch.BlockType.COMMAND,
          text: '选择AI模型 [MODEL]',
          arguments: {
            MODEL: {
              type: Scratch.ArgumentType.STRING,
              defaultValue: 'deepseek-chat'
            }
          }
        },
        {
          opcode: 'setLanguage',
          blockType: Scratch.BlockType.COMMAND,
          text: '设置聊天语言为 [LANGUAGE]',
          arguments: {
            LANGUAGE: {
              type: Scratch.ArgumentType.STRING,
              defaultValue: '中文'
            }
          }
        },

        // ===== 游戏背景 =====
        {
          opcode: 'setGameBackground',
          blockType: Scratch.BlockType.COMMAND,
          text: '设置游戏背景为 [BACKGROUND]',
          arguments: {
            BACKGROUND: {
              type: Scratch.ArgumentType.STRING,
              defaultValue: '这是一个神秘的魔法世界'
            }
          }
        },
        {
          opcode: 'setPlayerInfo',
          blockType: Scratch.BlockType.COMMAND,
          text: '设置玩家信息：名字 [NAME]，身份 [IDENTITY]，背景 [BACKGROUND]',
          arguments: {
            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: '冒险者' },
            IDENTITY: { type: Scratch.ArgumentType.STRING, defaultValue: '勇者' },
            BACKGROUND: { type: Scratch.ArgumentType.STRING, defaultValue: '' }
          }
        },

        // ===== 角色管理 =====
        {
          opcode: 'createCharacter',
          blockType: Scratch.BlockType.COMMAND,
          text: '创建AI角色：名字 [NAME]，个性 [PERSONALITY]，风格 [STYLE]，任务 [TASK]',
          arguments: {
            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: '小助手' },
            PERSONALITY: { type: Scratch.ArgumentType.STRING, defaultValue: '友好、乐于助人' },
            STYLE: { type: Scratch.ArgumentType.STRING, defaultValue: '亲切、温柔' },
            TASK: { type: Scratch.ArgumentType.STRING, defaultValue: '帮助玩家解决问题' }
          }
        },
        {
          opcode: 'setCharacterBackground',
          blockType: Scratch.BlockType.COMMAND,
          text: '设置角色 [NAME] 的背景为 [BACKGROUND]',
          arguments: {
            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: '小助手' },
            BACKGROUND: { type: Scratch.ArgumentType.STRING, defaultValue: '' }
          }
        },
        {
          opcode: 'deleteCharacter',
          blockType: Scratch.BlockType.COMMAND,
          text: '删除AI角色 [NAME]',
          arguments: {
            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: '小助手' }
          }
        },
        {
          opcode: 'clearHistory',
          blockType: Scratch.BlockType.COMMAND,
          text: '清空角色 [NAME] 的对话历史',
          arguments: {
            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: '小助手' }
          }
        },

        // ===== 对话积木 =====
        {
          opcode: 'chat',
          blockType: Scratch.BlockType.REPORTER,
          text: '对话：角色 [NAME]，消息 [MESSAGE]',
          arguments: {
            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: '小助手' },
            MESSAGE: { type: Scratch.ArgumentType.STRING, defaultValue: '你好！' }
          }
        },
        {
          opcode: 'chatAsync',
          blockType: Scratch.BlockType.COMMAND,
          text: '发送消息：角色 [NAME]，消息 [MESSAGE]，事件ID [EVENTID]',
          arguments: {
            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: '小助手' },
            MESSAGE: { type: Scratch.ArgumentType.STRING, defaultValue: '你好！' },
            EVENTID: { type: Scratch.ArgumentType.STRING, defaultValue: '1' }
          }
        },
        {
          opcode: 'whenResponse',
          blockType: Scratch.BlockType.HAT,
          text: '当收到AI响应'
        },

        // ===== 图片积木 =====
        {
          opcode: 'generateImage',
          blockType: Scratch.BlockType.REPORTER,
          text: '生成图片：提示词 [PROMPT]',
          arguments: {
            PROMPT: { type: Scratch.ArgumentType.STRING, defaultValue: '一只可爱的橙色小猫' }
          }
        },
        {
          opcode: 'recognizeImage',
          blockType: Scratch.BlockType.REPORTER,
          text: '识别图片：[IMAGE] 问题 [QUESTION]',
          arguments: {
            IMAGE: { type: Scratch.ArgumentType.STRING, defaultValue: 'https://example.com/image.png' },
            QUESTION: { type: Scratch.ArgumentType.STRING, defaultValue: '描述这张图片' }
          }
        },
        {
          opcode: 'generateCharacter',
          blockType: Scratch.BlockType.COMMAND,
          text: '生成角色：提示词 [PROMPT]',
          arguments: {
            PROMPT: { type: Scratch.ArgumentType.STRING, defaultValue: '一只可爱的橙色小猫' }
          }
        },
        {
          opcode: 'generateBackground',
          blockType: Scratch.BlockType.COMMAND,
          text: '生成背景：提示词 [PROMPT]',
          arguments: {
            PROMPT: { type: Scratch.ArgumentType.STRING, defaultValue: '星空下的魔法森林' }
          }
        },

        // ===== 状态查询 =====
        {
          opcode: 'getLastResponse',
          blockType: Scratch.BlockType.REPORTER,
          text: '最后的AI响应'
        },
        {
          opcode: 'getLastCharacter',
          blockType: Scratch.BlockType.REPORTER,
          text: '最后的响应角色'
        },
        {
          opcode: 'getLastEventId',
          blockType: Scratch.BlockType.REPORTER,
          text: '最后的事件ID'
        }
      ],

      menus: {
        aiProvider: [
          { text: 'DeepSeek', value: 'deepseek' },
          { text: 'Qwen', value: 'qwen' },
          { text: 'Pollinations', value: 'pollinations' }
        ]
      }
    };
  }

  _getModelMenu() {
    const adapter = this.adapters[this.settings.provider];
    if (!adapter) return [{ text: 'deepseek-chat', value: 'deepseek-chat' }];
    return adapter.models.map(m => ({ text: m, value: m }));
  }

  // ==================== 积木实现 ====================
  setProvider(args) {
    this.settings.provider = args.PROVIDER;
    const adapter = this.adapters[this.settings.provider];
    if (adapter) {
      this.settings.model = adapter.defaultModel;
    }
  }

  // 可用模型列表（供参考）
  getAvailableModels() {
    const result = {};
    for (const [name, adapter] of Object.entries(this.adapters)) {
      result[name] = adapter.models;
    }
    return result;
  }

  setApiKey(args) {
    this.settings.apiKey = args.KEY;
    this._saveSettings();
  }

  setModel(args) {
    this.settings.model = args.MODEL;
  }

  setLanguage(args) {
    this.settings.language = args.LANGUAGE;
  }

  setGameBackground(args) {
    this.settings.gameBackground = args.BACKGROUND;
  }

  setPlayerInfo(args) {
    this.settings.playerInfo = {
      name: args.NAME,
      identity: args.IDENTITY,
      background: args.BACKGROUND
    };
  }

  createCharacter(args) {
    const id = Date.now().toString();
    this.characters.set(args.NAME, {
      id: id,
      name: args.NAME,
      personality: args.PERSONALITY,
      speakingStyle: args.STYLE,
      task: args.TASK,
      background: ''
    });
    this.histories.set(args.NAME, []);
  }

  setCharacterBackground(args) {
    const character = this.characters.get(args.NAME);
    if (character) {
      character.background = args.BACKGROUND;
    }
  }

  deleteCharacter(args) {
    this.characters.delete(args.NAME);
    this.histories.delete(args.NAME);
  }

  clearHistory(args) {
    this.histories.set(args.NAME, []);
  }

  // ==================== 对话 ====================
  async chat(args) {
    if (!this.settings.apiKey) return '错误：请先设置 API 密钥';
    const character = this.characters.get(args.NAME);
    if (!character) return `错误：未找到角色 "${args.NAME}"`;

    const adapter = this.adapters[this.settings.provider];
    if (!adapter) return '错误：未选择 AI 服务';

    try {
      const response = await this._sendChatRequest(adapter, character, args.MESSAGE);

      const history = this.histories.get(args.NAME) || [];
      history.push({ role: 'user', content: args.MESSAGE });
      history.push({ role: 'assistant', content: response });
      this.histories.set(args.NAME, history);

      return response;
    } catch (error) {
      return `错误：${error.message}`;
    }
  }

  chatAsync(args) {
    const characterName = args.NAME;
    const userMessage = args.MESSAGE;
    const eventId = args.EVENTID;

    const character = this.characters.get(characterName);
    if (!character) {
      this._triggerResponse(characterName, `错误：未找到角色 "${characterName}"`, eventId);
      return;
    }

    if (!this.settings.apiKey) {
      this._triggerResponse(characterName, '错误：请先设置 API 密钥', eventId);
      return;
    }

    const adapter = this.adapters[this.settings.provider];
    if (!adapter) {
      this._triggerResponse(characterName, '错误：未选择 AI 服务', eventId);
      return;
    }

    this._sendChatRequest(adapter, character, userMessage)
      .then(response => {
        const history = this.histories.get(characterName) || [];
        history.push({ role: 'user', content: userMessage });
        history.push({ role: 'assistant', content: response });
        this.histories.set(characterName, history);

        this._triggerResponse(characterName, response, eventId);
      })
      .catch(error => {
        this._triggerResponse(characterName, `错误：${error.message}`, eventId);
      });
  }

  whenResponse() {}

  // ==================== 图片核心方法 ====================
  async _generateImageUrl(prompt) {
    const provider = this.settings.provider;
    if (provider === 'pollinations') {
      const adapter = this.adapters.pollinations;
      const url = adapter.buildImageUrl(prompt, this.settings.model);
      console.log('[AI Hub] Pollinations URL:', url);
      return url;
    }

    if (!this.settings.apiKey) throw new Error('请先设置 API 密钥');
    if (provider === 'qwen') {
      return await this._qwenGenerateImage(prompt);
    }
    throw new Error('当前服务不支持图片生成，请切换到 Pollinations 或 Qwen');
  }

  async _qwenGenerateImage(prompt) {
    const qwen = this.adapters.qwen;
    console.log('[AI Hub] 正在请求 Qwen 图片生成...');
    console.log('[AI Hub] Endpoint:', qwen.getImageGenEndpoint());
    console.log('[AI Hub] API Key 前8位:', this.settings.apiKey.substring(0, 8) + '...');

    let resp;
    try {
      resp = await Scratch.fetch(qwen.getImageGenEndpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.settings.apiKey}`,
          'X-DashScope-Async': 'enable'
        },
        body: JSON.stringify(qwen.buildImageGenBody(prompt))
      });
    } catch (fetchError) {
      console.error('[AI Hub] Fetch 失败:', fetchError.name, fetchError.message);
      throw new Error(`网络请求失败: ${fetchError.name}: ${fetchError.message}`);
    }

    console.log('[AI Hub] 响应状态:', resp.status, resp.statusText);

    if (!resp.ok) {
      let errBody = '';
      try { errBody = await resp.text(); } catch (e) {}
      console.error('[AI Hub] 响应错误体:', errBody);
      if (resp.status === 401) throw new Error('API 密钥无效 (401)');
      throw new Error(`请求失败 (${resp.status}): ${errBody || resp.statusText}`);
    }

    const result = await qwen.parseImageGenResponse(resp);
    console.log('[AI Hub] 解析结果:', result);

    if (result.async && result.taskId) {
      console.log('[AI Hub] 异步任务，taskId:', result.taskId);
      return await this._pollQwenTask(result.taskId);
    }

    if (result.url) return result.url;
    throw new Error('未获取到图片地址');
  }

  async generateImage(args) {
    try {
      return await this._generateImageUrl(args.PROMPT);
    } catch (e) {
      console.error('[AI Hub] generateImage 错误:', e);
      return `错误：${e.message}`;
    }
  }

  async recognizeImage(args) {
    if (!this.settings.apiKey) return '错误：请先设置 API 密钥';

    try {
      // 识别图片始终使用 Qwen，不受当前 provider 影响
      const qwen = this.adapters.qwen;
      const body = qwen.buildVisionBody(this.settings.model, args.IMAGE, args.QUESTION);
      const resp = await Scratch.fetch(qwen.getChatEndpoint(), {
        method: 'POST',
        headers: qwen.buildHeaders(this.settings.apiKey),
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        if (resp.status === 401) return '错误：API 密钥无效';
        return `错误：请求失败 (${resp.status})`;
      }

      return qwen.parseResponse(await resp.json());
    } catch (e) {
      return `错误：${e.message}`;
    }
  }

  // ==================== VM 访问辅助方法 ====================
  _getRuntime() {
    if (typeof Scratch !== 'undefined' && Scratch.vm && Scratch.vm.runtime) {
      return Scratch.vm.runtime;
    }
    if (typeof window !== 'undefined' && window.vm && window.vm.runtime) {
      return window.vm.runtime;
    }
    if (typeof window !== 'undefined') {
      for (const key of ['vm', 'scratch', 'Scratch']) {
        const obj = window[key];
        if (obj && obj.runtime) return obj.runtime;
      }
    }
    return null;
  }

  _getTarget(util) {
    // 方法1: util.target（标准方式）
    if (util && util.target) {
      console.log('[AI Hub] 通过 util.target 获取角色');
      return util.target;
    }

    // 方法2: Scratch.vm
    if (typeof Scratch !== 'undefined' && Scratch.vm && Scratch.vm.runtime) {
      const target = Scratch.vm.runtime.getEditingTarget();
      if (target) {
        console.log('[AI Hub] 通过 Scratch.vm 获取角色');
        return target;
      }
    }

    // 方法3: window.vm（TurboWarp 桌面版有时暴露这个）
    if (typeof window !== 'undefined' && window.vm && window.vm.runtime) {
      const target = window.vm.runtime.getEditingTarget();
      if (target) {
        console.log('[AI Hub] 通过 window.vm 获取角色');
        return target;
      }
    }

    // 方法4: 全局搜索 vm
    if (typeof window !== 'undefined') {
      for (const key of ['vm', 'scratch', 'Scratch']) {
        const obj = window[key];
        if (obj && obj.runtime) {
          const target = obj.runtime.getEditingTarget && obj.runtime.getEditingTarget();
          if (target) {
            console.log('[AI Hub] 通过 window.' + key + ' 获取角色');
            return target;
          }
        }
      }
    }

    console.error('[AI Hub] 无法获取当前角色。可用对象:', {
      hasUtil: !!util,
      hasUtilTarget: !!(util && util.target),
      hasScratchVM: !!(typeof Scratch !== 'undefined' && Scratch.vm),
      hasWindowVM: !!(typeof window !== 'undefined' && window.vm)
    });
    return null;
  }

  async generateCharacter(args, util) {
    try {
      const url = await this._generateImageUrl(args.PROMPT);
      const target = this._getTarget(util);
      if (!target) {
        console.error('[AI Hub] 无法获取当前角色，请确保积木在角色脚本中使用');
        console.log('[AI Hub] 图片URL（可手动复制到浏览器）:', url);
        return;
      }
      const name = await this._addCostumeFromUrl(url, target, 'AI角色');
      if (name) {
        console.log(`已添加角色造型：${name}`);
      } else {
        console.warn('生成角色成功但无法添加到造型，图片URL:', url);
      }
    } catch (e) {
      console.error('生成角色失败:', e);
    }
  }

  async generateBackground(args, util) {
    try {
      const url = await this._generateImageUrl(args.PROMPT);
      let stage = null;

      if (util && util.target && util.target.isStage) {
        stage = util.target;
      } else if (typeof Scratch !== 'undefined' && Scratch.vm && Scratch.vm.runtime) {
        stage = Scratch.vm.runtime.getTargetForStage();
      } else if (typeof window !== 'undefined' && window.vm && window.vm.runtime) {
        stage = window.vm.runtime.getTargetForStage();
      }

      if (!stage) {
        console.error('[AI Hub] 无法获取舞台');
        console.log('[AI Hub] 图片URL（可手动复制到浏览器）:', url);
        return;
      }
      const name = await this._addCostumeFromUrl(url, stage, 'AI背景');
      if (name) {
        console.log(`已添加舞台背景：${name}`);
      } else {
        console.warn('生成背景成功但无法添加到背景，图片URL:', url);
      }
    } catch (e) {
      console.error('生成背景失败:', e);
    }
  }

  // ==================== 状态查询 ====================
  getLastResponse() {
    return this._lastResponse || '';
  }

  getLastCharacter() {
    return this._lastCharacter || '';
  }

  getLastEventId() {
    return this._lastEventId || '';
  }

  // ==================== 内部方法 ====================
  async _sendChatRequest(adapter, character, userMessage) {
    // Pollinations 没有聊天接口，fallback 到 DeepSeek
    let actualAdapter = adapter;
    if (this.settings.provider === 'pollinations') {
      actualAdapter = this.adapters.deepseek;
      if (!actualAdapter) throw new Error('未配置 DeepSeek，Pollinations 无法提供聊天服务');
    }

    const history = this.histories.get(character.name) || [];
    const systemPrompt = this._buildSystemPrompt(character);

    const endpoint = actualAdapter.getEndpoint ? actualAdapter.getEndpoint() : actualAdapter.getChatEndpoint();
    const headers = actualAdapter.buildHeaders(this.settings.apiKey);
    const body = actualAdapter.buildBody(
      this.settings.model,
      actualAdapter.buildMessages(systemPrompt, history, userMessage)
    );

    const response = await Scratch.fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(actualAdapter.getErrorMessage({ ...errorData, status: response.status }));
    }

    const data = await response.json();
    return actualAdapter.parseResponse(data);
  }

  async _pollQwenTask(taskId) {
    const qwen = this.adapters.qwen;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const resp = await Scratch.fetch(
        `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
        { headers: { 'Authorization': `Bearer ${this.settings.apiKey}` } }
      );
      const data = await resp.json();
      if (data.output && data.output.task_status === 'SUCCEEDED') {
        const url = data.output.results && data.output.results[0] && data.output.results[0].url;
        if (!url) throw new Error('图片 URL 为空');
        return url.startsWith('//') ? 'https:' + url : url;
      }
      if (data.output && data.output.task_status === 'FAILED') {
        throw new Error(data.message || '生成任务失败');
      }
    }
    throw new Error('生成超时，请重试');
  }

  async _addCostumeFromUrl(url, target, namePrefix) {
    try {
      const costumes = target.getCostumes ? target.getCostumes() : (target.sprite ? target.sprite.costumes : []);
      const existingNames = new Set(costumes.map(c => c.name));
      let name = namePrefix;
      let counter = 1;
      while (existingNames.has(name)) {
        name = `${namePrefix}-${counter}`;
        counter++;
      }

      const response = await Scratch.fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();

      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const { width, height } = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = reject;
        img.src = dataUrl;
      });

      const runtime = this._getRuntime();
      if (!runtime) throw new Error('无法访问 Scratch VM');

      // 方法1：TurboWarp runtime.addCostume（最简便）
      if (runtime.addCostume) {
        try {
          const costume = await runtime.addCostume(dataUrl, target);
          if (costume) {
            costume.name = name;
            costume.bitmapResolution = 2;
            costume.rotationCenterX = width / 2;
            costume.rotationCenterY = height / 2;
            if (target.updateAllDrawableProperties) target.updateAllDrawableProperties();
            target.setCostume(target.getCostumes ? target.getCostumes().length - 1 : 0);
            return name;
          }
        } catch (e) {
          console.warn('方法1 (runtime.addCostume) 失败:', e);
        }
      }

      // 方法2：通过 storage 手动创建 asset
      if (runtime.storage && runtime.storage.createAsset) {
        try {
          const storage = runtime.storage;
          const format = (blob.type.includes('jpeg') || blob.type.includes('jpg')) ? 'jpg' : 'png';
          const base64Str = dataUrl.split(',')[1];
          if (!base64Str) throw new Error('Base64 数据为空');
          const uint8 = Uint8Array.from(atob(base64Str), c => c.charCodeAt(0));

          const asset = storage.createAsset(
            storage.AssetType.ImageBitmap,
            format,
            uint8
          );

          const costumeData = {
            name: name,
            dataFormat: format,
            assetId: asset.assetId,
            md5ext: asset.md5ext,
            bitmapResolution: 2,
            rotationCenterX: width / 2,
            rotationCenterY: height / 2,
            asset: asset
          };

          if (target.addCostume) {
            await target.addCostume(costumeData);
          } else if (target.sprite && target.sprite.costumes) {
            target.sprite.costumes.push(costumeData);
          } else {
            throw new Error('无法向目标添加造型');
          }

          if (target.setCostume) {
            const costumeList = target.getCostumes ? target.getCostumes() : (target.sprite ? target.sprite.costumes : []);
            target.setCostume(costumeList.length - 1);
          }
          return name;
        } catch (e) {
          console.warn('方法2 (storage) 失败:', e);
        }
      }

      throw new Error('没有可用的 VM API');
    } catch (e) {
      console.error('添加造型失败:', e);
      return null;
    }
  }

  _buildSystemPrompt(character) {
    let prompt = '';

    if (this.settings.gameBackground) {
      prompt += `【游戏背景】\n${this.settings.gameBackground}\n\n`;
    }

    prompt += `【玩家信息】\n`;
    prompt += `名字：${this.settings.playerInfo.name}\n`;
    prompt += `身份：${this.settings.playerInfo.identity}\n`;
    if (this.settings.playerInfo.background) {
      prompt += `背景：${this.settings.playerInfo.background}\n`;
    }
    prompt += `\n`;

    prompt += `【角色信息】\n`;
    prompt += `角色名：${character.name}\n`;
    prompt += `个性：${character.personality}\n`;
    prompt += `说话风格：${character.speakingStyle}\n`;
    prompt += `任务：${character.task}\n`;
    if (character.background) {
      prompt += `角色背景：${character.background}\n`;
    }
    prompt += `\n`;

    prompt += `【对话要求】\n`;
    prompt += `请使用 ${this.settings.language} 进行对话。\n`;
    prompt += `请始终保持角色设定，用角色的风格和个性来回应。\n`;

    return prompt;
  }

  _triggerResponse(character, response, eventId) {
    this._lastResponse = response;
    this._lastCharacter = character;
    this._lastEventId = eventId;
  }

  _saveSettings() {
    try {
      localStorage.setItem('aihub-settings', JSON.stringify({
        provider: this.settings.provider,
        apiKey: this.settings.apiKey,
        model: this.settings.model,
        language: this.settings.language
      }));
    } catch (e) {
      // 忽略存储错误
    }
  }

  _loadSettings() {
    try {
      const saved = localStorage.getItem('aihub-settings');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.provider) this.settings.provider = data.provider;
        if (data.apiKey) this.settings.apiKey = data.apiKey;
        if (data.model) this.settings.model = data.model;
        if (data.language) this.settings.language = data.language;
      }
    } catch (e) {
      // 忽略加载错误
    }
  }
}

// 注册扩展
Scratch.extensions.register(new AIHubExtension());

})(Scratch);
