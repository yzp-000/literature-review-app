import { Typography, Card, Collapse, Tag, Divider, Steps, Alert } from 'antd';
import {
  FolderOutlined,
  FileTextOutlined,
  SearchOutlined,
  ApartmentOutlined,
  ExportOutlined,
  SettingOutlined,
  RocketOutlined,
  UploadOutlined,
  EditOutlined,
  ReadOutlined,
  RobotOutlined,
  FilePdfOutlined,
  ColumnWidthOutlined,
  FormOutlined,
} from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

const steps = [
  {
    title: '配置 LLM',
    description: '前往「设置」页，配置工作目录，并添加一个 LLM 提供商（如 DeepSeek / OpenAI / Claude），填写 API Key。',
  },
  {
    title: '创建课题',
    description: '前往「课题管理」页，点击「新建课题」输入课题名称，系统会自动创建标准目录结构。',
  },
  {
    title: '添加论文',
    description: '进入课题后在「论文管理」页，可通过「导入 PDF」自动解析元数据，也可「手动添加」填写基本信息。系统自动生成 7 节笔记模板。',
  },
  {
    title: '阅读 & 笔记',
    description: '点击论文标题进入详情页，左侧 PDF 右侧笔记分屏阅读。可手动编辑笔记，也可点击「AI 生成总结」自动生成。',
  },
  {
    title: '文献检索',
    description: '使用「文献检索」页输入研究方向，AI 自动推荐论文、验证信息、尝试下载 PDF 并导入文献库。',
  },
  {
    title: '关系图谱',
    description: '在「关系图谱」页为论文添加引用/关联/对比等关系，通过力导向图直观查看论文间的关系网络。',
  },
  {
    title: '导出报告',
    description: '在「导出」页选择论文，可选生成 AI 综合总结，然后导出为 PDF 格式的调研报告。',
  },
  {
    title: '论文写作',
    description: '在「论文写作」页创建写作项目，使用 LaTeX 编辑器撰写论文。支持 AI 续写、润色、生成章节，以及实时预览和 PDF 编译。',
  },
];

const featurePanels = [
  {
    key: 'workspace',
    label: (
      <span><FolderOutlined style={{ marginRight: 8 }} />课题管理 & 概览</span>
    ),
    children: (
      <div>
        <Paragraph>管理多个独立的文献调研课题，同时展示当前课题的概览信息。</Paragraph>
        <ul>
          <li><Text strong>新建课题</Text>：输入课题名称后自动创建标准文件夹结构（<Text code>pdfs/</Text>、<Text code>00_总览总结/</Text>、<Text code>01_单篇论文/</Text>、<Text code>02_关键技术总结/</Text>）。</li>
          <li><Text strong>切换课题</Text>：点击课题卡片或通过左侧边栏顶部下拉菜单快速切换。当前课题会以蓝色边框高亮显示。</li>
          <li><Text strong>课题概览</Text>：选中课题后页面下方自动展示论文总数、阅读状态统计（未读/阅读中/已完成）、最近论文列表（可点击跳转详情）、文档文件列表。</li>
          <li><Text strong>自动发现</Text>：系统会自动识别工作目录下所有以 <Text code>_文献调研</Text> 结尾的文件夹作为已有课题。</li>
          <li><Text strong>删除课题</Text>：在课题卡片上点击「删除」按钮（会永久删除所有文件，请谨慎操作）。</li>
        </ul>
      </div>
    ),
  },
  {
    key: 'papers',
    label: (
      <span><FileTextOutlined style={{ marginRight: 8 }} />论文管理</span>
    ),
    children: (
      <div>
        <Paragraph>核心功能页面，管理课题下的所有论文。</Paragraph>
        <ul>
          <li><Text strong>导入 PDF</Text>：点击「导入 PDF」上传文件，系统自动提取元数据（标题、作者、年份、DOI 等），弹出确认窗口供核对和补充。</li>
          <li><Text strong>手动添加</Text>：填写中/英文标题、作者、年份、期刊、DOI、关键词等信息。添加后自动生成 7 节笔记模板。</li>
          <li><Text strong>编辑论文</Text>：在操作列点击编辑按钮，可修改论文的标题、作者、年份、期刊、DOI、关键词等元数据信息。</li>
          <li><Text strong>搜索与筛选</Text>：支持按关键词搜索标题/作者/关键词，也可按阅读状态筛选。</li>
          <li><Text strong>列显示配置</Text>：点击「显示列」按钮可选择表格中需要展示的列（编号、标题、作者、年份、期刊、关键词、DOI、状态、PDF、操作），偏好自动保存在本地。</li>
          <li><Text strong>状态管理</Text>：在表格的操作列直接修改论文阅读状态。</li>
          <li><Text strong>上传 PDF</Text>：未关联 PDF 的论文可在 PDF 列点击「上传」。</li>
          <li><Text strong>DOI 链接</Text>：标题旁若有 DOI 信息会显示为可点击的跳转链接，方便直接访问原文页面。</li>
        </ul>
      </div>
    ),
  },
  {
    key: 'detail',
    label: (
      <span><EditOutlined style={{ marginRight: 8 }} />论文详情（分屏阅读）</span>
    ),
    children: (
      <div>
        <Paragraph>点击论文标题进入详情页，采用可调节的左右分屏布局。</Paragraph>
        <ul>
          <li><Text strong>左侧 — PDF 预览</Text>：基于 react-pdf 渲染的 PDF 阅读器，文字直接渲染在页面 DOM 中，支持选中复制。需先为该论文上传 PDF。</li>
          <li><Text strong>右侧 — 笔记编辑</Text>：7 节结构化笔记。可在「预览」和「编辑」模式间切换，编辑模式下使用 Markdown 编辑器。支持数学公式渲染（LaTeX 语法）。</li>
          <li><Text strong>分屏比例调节</Text>：可通过顶部的 7:3 / 5:5 / 3:7 按钮快速切换，也可拖拽中间分隔条自由调整 PDF 和笔记的宽度比例。</li>
          <li><Text strong>划词翻译</Text>：点击顶部「划词翻译」按钮开启后，在 PDF 或笔记区域选中英文文本即可弹出翻译小窗，流式显示中文翻译结果。再次点击按钮可关闭。</li>
          <li><Text strong>AI 生成总结</Text>：点击「AI 生成总结」按钮，AI 会根据 PDF 内容自动生成 2~7 节笔记。生成完成后可选择「智能合并」（保留第 1 节，替换 2~7 节）或「重新生成全部笔记」。生成任务在后台运行，切换页面不会中断，完成后返回自动弹出预览。</li>
          <li>顶部显示论文元数据（作者、年份、期刊、DOI 链接等），可直接修改阅读状态。</li>
          <li>编辑后点击「保存」按钮将内容写入对应的 Markdown 文件。</li>
        </ul>
      </div>
    ),
  },
  {
    key: 'search',
    label: (
      <span><SearchOutlined style={{ marginRight: 8 }} />文献检索</span>
    ),
    children: (
      <div>
        <Paragraph>基于 AI 的自动化文献检索，支持自动验证、PDF 下载和文献库导入。</Paragraph>
        <ul>
          <li><Text strong>前置条件</Text>：需要先在「设置」页配置至少一个 LLM 提供商。</li>
          <li><Text strong>检索表单</Text>：
            <ul>
              <li><Text>研究方向</Text>：描述你想要检索的研究领域或问题</li>
              <li><Text>论文数量</Text>：期望推荐的论文篇数（默认 10 篇）</li>
              <li><Text>年份范围</Text>：可选限制发表年份区间</li>
              <li><Text>其他要求</Text>：补充说明（如侧重某种方法、排除某类论文等）</li>
              <li><Text>自动生成总结</Text>：开启后在导入文献库时自动为每篇论文生成 7 节笔记</li>
            </ul>
          </li>
          <li><Text strong>检索流程</Text>（5~6 步自动执行）：
            <ol>
              <li>AI 推荐论文列表</li>
              <li>通过 CrossRef 数据库验证论文真实性及补全元数据</li>
              <li>尝试从 arXiv / Unpaywall 下载开放获取 PDF</li>
              <li>自动导入文献库（创建论文记录和笔记模板）</li>
              <li>（可选）AI 自动生成论文总结笔记</li>
            </ol>
          </li>
          <li><Text strong>检索结果</Text>：表格展示每篇论文的验证状态、PDF 下载状态、总结生成状态等。</li>
          <li><Text strong>后台持续运行</Text>：检索任务在后台执行，即使切换到其他页面也不会中断。检索进行中时左侧菜单「文献检索」会显示运行指示器，返回页面可继续查看进度。</li>
          <li><Text strong>历史记录</Text>：所有检索记录自动保存，切换到「历史记录」标签可查看和回顾。</li>
        </ul>
      </div>
    ),
  },
  {
    key: 'graph',
    label: (
      <span><ApartmentOutlined style={{ marginRight: 8 }} />关系图谱</span>
    ),
    children: (
      <div>
        <Paragraph>交互式力导向图谱，可视化论文之间的关系网络。</Paragraph>
        <ul>
          <li><Text strong>图谱展示</Text>：节点代表论文（按阅读状态着色：灰色=未读、蓝色=阅读中、绿色=已完成），边代表关系（不同颜色区分类型）。</li>
          <li><Text strong>交互操作</Text>：
            <ul>
              <li>鼠标悬停节点：右上角弹出论文详情（作者、年份、期刊、关键词）</li>
              <li>点击节点：右侧展开详情面板，显示论文信息和关系列表，可跳转论文详情页</li>
              <li>拖拽节点：固定节点位置，方便调整布局</li>
              <li>滚轮缩放、拖拽画布平移</li>
            </ul>
          </li>
          <li><Text strong>添加关系</Text>：在顶部选择源论文 → 关系类型 → 目标论文，点击「添加」。对称关系（引用/被引用、相关）会自动创建双向记录。</li>
          <li><Text strong>删除关系</Text>：在右侧详情面板的关系列表中逐条删除。</li>
          <li><Text strong>关系类型</Text>：<Tag>引用 cites</Tag> <Tag>被引用 cited_by</Tag> <Tag>相关 related_to</Tag> <Tag>对比 contrasts_with</Tag> <Tag>扩展 extends</Tag></li>
          <li><Text strong>全屏 & 适应</Text>：支持全屏模式和一键适应画布大小。</li>
          <li>左下角图例显示节点颜色和边颜色的含义。</li>
        </ul>
      </div>
    ),
  },
  {
    key: 'export',
    label: (
      <span><ExportOutlined style={{ marginRight: 8 }} />导出</span>
    ),
    children: (
      <div>
        <Paragraph>将调研成果导出为 PDF 格式的调研报告。</Paragraph>
        <ul>
          <li><Text strong>选择论文</Text>：勾选需要导出的论文（不勾选则默认导出所有）。每篇论文会显示阅读状态和是否有笔记内容。</li>
          <li><Text strong>导出选项</Text>：
            <ul>
              <li>封面页：包含课题名称、论文统计信息</li>
              <li>目录：按编号列出所有论文</li>
              <li>AI 综合总结：放在报告最前面的整体文献综述</li>
            </ul>
          </li>
          <li><Text strong>AI 综合总结</Text>：点击「生成总结」，AI 会根据选中论文的笔记内容，自动生成包含六部分的综合文献总结（研究概述、方向分类、方法对比、研究成果、趋势展望、课题启示）。生成后可预览和手动编辑修改。生成任务在后台运行，切换页面不会丢失进度。</li>
          <li><Text strong>导出 PDF</Text>：点击「导出 PDF」按钮后浏览器会打开打印预览窗口，在打印对话框中目标选择「另存为 PDF / Save as PDF」即可保存。</li>
          <li><Text strong>预览 HTML</Text>：先在新窗口中查看渲染效果，确认无误后再导出。</li>
          <li>建议使用 Chrome 或 Edge 浏览器获得最佳导出效果。</li>
        </ul>
      </div>
    ),
  },
  {
    key: 'writing',
    label: (
      <span><FormOutlined style={{ marginRight: 8 }} />论文写作</span>
    ),
    children: (
      <div>
        <Paragraph>AI 辅助的 LaTeX 论文写作环境，支持实时预览和 PDF 编译。</Paragraph>
        <ul>
          <li><Text strong>写作项目</Text>：独立于课题管理，每个写作项目对应一个 <Text code>[项目名]_论文写作/</Text> 文件夹。支持「标准论文模板」（含 ctex 中文支持）和「空白模板」。</li>
          <li><Text strong>LaTeX 编辑器</Text>：基于 CodeMirror 6 的专业 LaTeX 编辑器，支持语法高亮、行号、括号匹配、搜索替换。快捷键 <Text code>Ctrl+S</Text> 保存。</li>
          <li><Text strong>实时预览</Text>：基于 latex.js 的前端实时渲染预览（部分 LaTeX 宏包如 ctex、tikz 不支持，建议使用 PDF 编译查看完整效果）。</li>
          <li><Text strong>PDF 编译</Text>：通过后端 xelatex 编译生成 PDF，支持中文排版。编译运行两遍以处理交叉引用。需服务器安装 <Text code>texlive-xetex</Text> 和 <Text code>texlive-lang-chinese</Text>。</li>
          <li><Text strong>AI 续写</Text>：将光标放在想要续写的位置，点击「AI续写」，AI 会根据上下文自动续写论文内容，流式插入到编辑器中。</li>
          <li><Text strong>AI 润色</Text>：选中需要润色的文本，点击「AI润色」，AI 会对选中文本进行学术润色并替换。</li>
          <li><Text strong>AI 生成章节</Text>：点击「AI生成章节」输入章节标题和写作要点，AI 会在光标位置生成完整的章节内容。</li>
          <li><Text strong>AI 对话面板</Text>：点击右上角对话图标打开侧边 AI 对话面板，可以咨询论文结构、写作方法、LaTeX 语法等问题。AI 回复可一键插入编辑器。</li>
          <li><Text strong>分屏拖拽</Text>：编辑器和预览区之间支持拖拽调整宽度比例。</li>
          <li><Text strong>未保存提示</Text>：有未保存更改时页面顶部显示提醒，关闭页面前会弹出确认。</li>
        </ul>
      </div>
    ),
  },
  {
    key: 'settings',
    label: (
      <span><SettingOutlined style={{ marginRight: 8 }} />设置</span>
    ),
    children: (
      <div>
        <Paragraph>管理工作目录和 LLM 提供商配置。</Paragraph>
        <ul>
          <li><Text strong>工作目录</Text>：设置课题文件的存放根目录，支持浏览选择和创建新目录。</li>
          <li><Text strong>添加提供商</Text>：填写名称、API Base URL、API Key、模型名称。支持任何 OpenAI 兼容接口（DeepSeek、OpenAI、Claude 兼容网关、通义千问、Ollama 等）。URL 会自动补全 <Text code>/v1</Text> 路径。</li>
          <li><Text strong>参数调整</Text>：可设置 Max Tokens 和 Temperature。</li>
          <li><Text strong>默认提供商</Text>：设为默认后，文献检索、AI 生成总结等功能将优先使用该提供商。</li>
          <li>API Key 在设置页以脱敏形式展示，安全存储在本地 <Text code>config.json</Text> 中。编辑提供商时，API Key 栏留空即保持原 Key 不变，无需重复输入。</li>
        </ul>
      </div>
    ),
  },
];

const faqPanels = [
  {
    key: 'faq1',
    label: '数据存储在哪里？',
    children: (
      <Paragraph>
        所有数据以人类可读的格式存储在本地文件系统中。每个课题对应一个 <Text code>[课题名]_文献调研/</Text> 文件夹，
        论文元数据存储在 <Text code>papers.json</Text>，笔记为独立的 Markdown 文件，PDF 存储在 <Text code>pdfs/</Text> 子目录。
        检索历史存储在 <Text code>search_history.json</Text>。应用全局配置（含 LLM 设置）存储在 <Text code>config.json</Text>。
      </Paragraph>
    ),
  },
  {
    key: 'faq2',
    label: '支持哪些 LLM 提供商？',
    children: (
      <Paragraph>
        支持所有兼容 OpenAI <Text code>/v1/chat/completions</Text> 接口的提供商，包括但不限于：DeepSeek、OpenAI（GPT-4o 等）、
        Anthropic Claude（通过兼容网关）、通义千问、智谱 GLM、本地部署的 Ollama 等。只需填写正确的 Base URL、API Key 和模型名即可。
        系统会自动处理 URL 补全（如自动加上 <Text code>/v1</Text> 后缀）。
      </Paragraph>
    ),
  },
  {
    key: 'faq3',
    label: '7 节笔记模板包含哪些内容？',
    children: (
      <div>
        <Paragraph>每篇论文的 Markdown 笔记包含以下 7 个标准章节：</Paragraph>
        <ol>
          <li><Text strong>论文基本信息</Text> — 标题、作者、年份、期刊、DOI、关键词（表格形式）</li>
          <li><Text strong>研究背景与动机</Text> — 问题是什么，为何重要</li>
          <li><Text strong>核心方法与技术路线</Text> — 具体解决方案</li>
          <li><Text strong>实验设计与结果</Text> — 怎么验证，效果如何</li>
          <li><Text strong>创新点与贡献</Text> — 相比已有工作的独特之处</li>
          <li><Text strong>局限性与未来工作</Text> — 还有什么问题待解决</li>
          <li><Text strong>个人评价与笔记</Text> — 自己的思考和笔记</li>
        </ol>
        <Paragraph>可以手动编辑填写，也可以使用「AI 生成总结」功能自动生成第 2~7 节内容。</Paragraph>
      </div>
    ),
  },
  {
    key: 'faq4',
    label: '如何导入已有的调研工作区？',
    children: (
      <Paragraph>
        将已有的 <Text code>[课题名]_文献调研/</Text> 文件夹放到应用设置的工作根目录下，
        系统会自动识别。确保文件夹中有 <Text code>papers.json</Text> 文件以便正确加载论文列表。
      </Paragraph>
    ),
  },
  {
    key: 'faq5',
    label: '如何启动应用？',
    children: (
      <div>
        <Paragraph>在项目根目录运行：</Paragraph>
        <Paragraph><Text code>./start.sh</Text></Paragraph>
        <Paragraph>
          启动后访问 <Text code>http://127.0.0.1:5173</Text>（前端）。
          后端 API 文档可访问 <Text code>http://127.0.0.1:8000/docs</Text>。
        </Paragraph>
      </div>
    ),
  },
  {
    key: 'faq6',
    label: '笔记中的数学公式显示不正常？',
    children: (
      <Paragraph>
        系统支持 LaTeX 数学公式渲染。行内公式使用 <Text code>$...$</Text>，独立公式块使用 <Text code>$$...$$</Text>。
        如果公式显示为原始代码，请检查公式语法是否正确。导出的 PDF 中同样支持公式渲染（需联网加载 KaTeX 样式）。
      </Paragraph>
    ),
  },
  {
    key: 'faq7',
    label: '文献检索找到的论文信息准确吗？',
    children: (
      <Paragraph>
        检索流程会通过 CrossRef 学术数据库对 AI 推荐的论文进行真实性验证和元数据补全。
        验证通过的论文会标记为「已验证」，未通过的仅保留 AI 提供的信息供参考。
        建议对重要论文手动核实 DOI 和出版信息。
      </Paragraph>
    ),
  },
];

export default function GuidePage() {
  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <Title level={3}>使用说明</Title>

      <Alert
        message="快速上手"
        description="首次使用只需三步：1) 设置页配置工作目录和 LLM API Key → 2) 创建课题 → 3) 开始添加论文并记录笔记。"
        type="info"
        showIcon
        icon={<RocketOutlined />}
        style={{ marginBottom: 24 }}
      />

      <Card title="快速开始流程" style={{ marginBottom: 24 }}>
        <Steps
          direction="vertical"
          size="small"
          current={-1}
          items={steps.map((s) => ({ title: s.title, description: s.description }))}
        />
      </Card>

      <Card title="功能详细说明" style={{ marginBottom: 24 }}>
        <Collapse items={featurePanels} defaultActiveKey={['workspace']} />
      </Card>

      <Card title="常见问题" style={{ marginBottom: 24 }}>
        <Collapse items={faqPanels} />
      </Card>

      <Card title="文件目录结构" style={{ marginBottom: 24 }}>
        <pre style={{ background: '#fafafa', padding: 16, borderRadius: 6, fontSize: 13, lineHeight: 1.8, overflow: 'auto' }}>
{`工作根目录/
├── literature-review-app/          # 应用程序
│   ├── config.json                 # 全局配置（LLM 提供商等）
│   ├── start.sh                    # 启动脚本
│   ├── backend/                    # 后端 (FastAPI)
│   └── frontend/                   # 前端 (React + Vite + Ant Design)
│
├── [课题A]_文献调研/                 # 课题工作空间
│   ├── papers.json                 # 论文元数据
│   ├── search_history.json         # 检索历史记录
│   ├── pdfs/                       # PDF 文件
│   ├── 00_总览总结/
│   │   └── 总览总结.md
│   ├── 01_单篇论文/
│   │   ├── 01_[论文标题].md        # 7 节笔记
│   │   └── 02_[论文标题].md
│   └── 02_关键技术总结/
│       └── 01_[主题].md
│
├── [课题B]_文献调研/                 # 另一个课题
│   └── ...
│
└── [项目名]_论文写作/                # 论文写作项目
    ├── writing.json                # 项目元数据
    ├── main.tex                    # 主 LaTeX 文件
    └── output/                     # 编译输出目录
        └── main.pdf                # 编译生成的 PDF`}
        </pre>
      </Card>
    </div>
  );
}
