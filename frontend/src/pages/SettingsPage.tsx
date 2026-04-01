import { useState, useEffect } from 'react';
import { Typography, Card, Form, Input, Button, Table, Space, Switch, message, Popconfirm, InputNumber, Tag, Alert, Upload } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, FolderOutlined, FolderOpenOutlined, CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined, UploadOutlined, FileTextOutlined, SaveOutlined } from '@ant-design/icons';
import { settingsApi } from '../api';
import { useAppStore } from '../stores/useAppStore';
import FolderPicker from '../components/FolderPicker';

const { Title, Text } = Typography;

export default function SettingsPage() {
  // ---- Base directory state ----
  const [baseDirInfo, setBaseDirInfo] = useState<{ base_dir: string; configured: string; exists: boolean; is_dir: boolean } | null>(null);
  const [baseDirInput, setBaseDirInput] = useState('');
  const [savingBaseDir, setSavingBaseDir] = useState(false);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);

  // ---- LLM provider state ----
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  // ---- Note template state ----
  const [noteTemplate, setNoteTemplate] = useState('');
  const [noteTemplateIsCustom, setNoteTemplateIsCustom] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  const { fetchWorkspaces } = useAppStore();

  const fetchBaseDir = async () => {
    try {
      const info = await settingsApi.getBaseDir();
      setBaseDirInfo(info);
      setBaseDirInput(info.configured || '');
    } catch {
      message.error('加载根目录设置失败');
    }
  };

  const fetchProviders = async () => {
    setLoading(true);
    try {
      const settings = await settingsApi.get();
      setProviders(settings.llm_providers || []);
    } catch {
      message.error('加载设置失败');
    }
    setLoading(false);
  };

  const fetchNoteTemplate = async () => {
    try {
      const data = await settingsApi.getNoteTemplate();
      setNoteTemplate(data.template || '');
      setNoteTemplateIsCustom(data.is_custom || false);
    } catch {
      message.error('加载笔记模板失败');
    }
  };

  useEffect(() => {
    fetchBaseDir();
    fetchProviders();
    fetchNoteTemplate();
  }, []);

  // ---- Base directory handlers ----
  const handleSaveBaseDir = async () => {
    setSavingBaseDir(true);
    try {
      const result = await settingsApi.setBaseDir(baseDirInput.trim());
      message.success(`根目录已设置为: ${result.base_dir}`);
      fetchBaseDir();
      fetchWorkspaces();
    } catch (e: any) {
      message.error(e.response?.data?.detail || '设置失败');
    }
    setSavingBaseDir(false);
  };

  const handleResetBaseDir = async () => {
    setSavingBaseDir(true);
    try {
      const result = await settingsApi.setBaseDir('');
      message.success('已恢复默认根目录');
      setBaseDirInput('');
      fetchBaseDir();
      fetchWorkspaces();
    } catch {
      message.error('重置失败');
    }
    setSavingBaseDir(false);
  };

  // ---- Note template handlers ----
  const handleSaveTemplate = async () => {
    setSavingTemplate(true);
    try {
      await settingsApi.setNoteTemplate(noteTemplate);
      setNoteTemplateIsCustom(true);
      message.success('笔记模板已保存');
    } catch {
      message.error('保存模板失败');
    }
    setSavingTemplate(false);
  };

  const handleResetTemplate = async () => {
    setSavingTemplate(true);
    try {
      const data = await settingsApi.resetNoteTemplate();
      setNoteTemplate(data.template || '');
      setNoteTemplateIsCustom(false);
      message.success('已恢复默认模板');
    } catch {
      message.error('重置模板失败');
    }
    setSavingTemplate(false);
  };

  const handleImportTemplate = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        setNoteTemplate(content);
        message.success('模板文件已导入，请点击「保存」使其生效');
      }
    };
    reader.readAsText(file);
    return false; // prevent auto upload
  };

  // ---- LLM provider handlers ----
  const handleAdd = () => {
    setModalMode('add');
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ max_tokens: 4096, temperature: 0.7, is_default: false });
  };

  const handleEdit = (record: any) => {
    setModalMode('edit');
    setEditingId(record.id);
    form.setFieldsValue({
      name: record.name,
      base_url: record.base_url,
      api_key: '',
      model: record.model,
      max_tokens: record.max_tokens || 4096,
      temperature: record.temperature || 0.7,
      is_default: record.is_default,
    });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (modalMode === 'add') {
        await settingsApi.addProvider(values);
        message.success('添加成功');
      } else if (editingId) {
        await settingsApi.updateProvider(editingId, values);
        message.success('更新成功');
      }
      setModalMode(null);
      form.resetFields();
      fetchProviders();
    } catch (e: any) {
      if (!e.errorFields) message.error('操作失败');
    }
  };

  const handleDelete = async (id: string) => {
    await settingsApi.deleteProvider(id);
    message.success('已删除');
    fetchProviders();
  };

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: 'API URL', dataIndex: 'base_url', key: 'base_url', ellipsis: true },
    { title: '模型', dataIndex: 'model', key: 'model' },
    {
      title: '默认',
      dataIndex: 'is_default',
      key: 'is_default',
      render: (v: boolean) => v ? '是' : '-',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, r: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>编辑</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <Title level={3}>设置</Title>

      {/* ---- 根目录设置 ---- */}
      <Card
        title={<span><FolderOutlined style={{ marginRight: 8 }} />工作根目录</span>}
        style={{ marginBottom: 24 }}
      >
        <Alert
          message="所有课题文件夹都创建在此目录下。修改根目录后，左侧课题列表会自动刷新为新目录中的课题。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        {baseDirInfo && (
          <div style={{ marginBottom: 16 }}>
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Space>
                <Text strong>当前生效目录:</Text>
                <Text code>{baseDirInfo.base_dir}</Text>
                {baseDirInfo.exists && baseDirInfo.is_dir ? (
                  <Tag icon={<CheckCircleOutlined />} color="success">目录有效</Tag>
                ) : (
                  <Tag icon={<CloseCircleOutlined />} color="error">目录不存在</Tag>
                )}
              </Space>
              {!baseDirInfo.configured && (
                <Text type="secondary">（使用默认值：应用上级目录）</Text>
              )}
            </Space>
          </div>
        )}

        <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
          <Input
            value={baseDirInput}
            onChange={(e) => setBaseDirInput(e.target.value)}
            placeholder="输入自定义根目录绝对路径，如 /home/user/research"
            onPressEnter={handleSaveBaseDir}
            style={{ flex: 1 }}
          />
          <Button
            icon={<FolderOpenOutlined />}
            onClick={() => setFolderPickerOpen(true)}
          >
            浏览
          </Button>
          <Button type="primary" onClick={handleSaveBaseDir} loading={savingBaseDir}>
            保存
          </Button>
        </Space.Compact>

        <Space>
          <Button icon={<ReloadOutlined />} onClick={handleResetBaseDir} loading={savingBaseDir}>
            恢复默认
          </Button>
          <Text type="secondary">
            留空即恢复为默认值（应用所在目录的上级目录）
          </Text>
        </Space>

        <FolderPicker
          open={folderPickerOpen}
          initialPath={baseDirInfo?.base_dir}
          onCancel={() => setFolderPickerOpen(false)}
          onOk={async (path) => {
            setFolderPickerOpen(false);
            setBaseDirInput(path);
            setSavingBaseDir(true);
            try {
              const result = await settingsApi.setBaseDir(path);
              message.success(`根目录已设置为: ${result.base_dir}`);
              fetchBaseDir();
              fetchWorkspaces();
            } catch (e: any) {
              message.error(e.response?.data?.detail || '设置失败');
            }
            setSavingBaseDir(false);
          }}
        />
      </Card>

      {/* ---- LLM 提供商 ---- */}
      <Card
        title="LLM 提供商"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>添加</Button>}
        style={{ marginBottom: 24 }}
      >
        <Table
          dataSource={providers}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="middle"
        />
      </Card>

      {modalMode && (
        <Card title={modalMode === 'add' ? '添加 LLM 提供商' : '编辑 LLM 提供商'} style={{ marginBottom: 24 }}>
          <Form form={form} layout="vertical" style={{ maxWidth: 500 }}>
            <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
              <Input placeholder="如 DeepSeek / OpenAI / Claude" />
            </Form.Item>
            <Form.Item name="base_url" label="API Base URL" rules={[{ required: true, message: '请输入 API URL' }]}>
              <Input placeholder="https://api.deepseek.com/v1" />
            </Form.Item>
            <Form.Item name="api_key" label="API Key" rules={[{ required: modalMode === 'add', message: '请输入 API Key' }]}>
              <Input.Password placeholder={modalMode === 'edit' ? '留空则保持原 Key 不变' : 'sk-xxxx'} />
            </Form.Item>
            <Form.Item name="model" label="模型" rules={[{ required: true, message: '请输入模型名' }]}>
              <Input placeholder="deepseek-chat" />
            </Form.Item>
            <Form.Item name="max_tokens" label="最大 Tokens">
              <InputNumber min={256} max={32768} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="temperature" label="Temperature">
              <InputNumber min={0} max={2} step={0.1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="is_default" label="设为默认" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Space>
              <Button type="primary" onClick={handleSubmit}>
                {modalMode === 'add' ? '添加' : '保存'}
              </Button>
              <Button onClick={() => { setModalMode(null); form.resetFields(); }}>取消</Button>
            </Space>
          </Form>
        </Card>
      )}

      {/* ---- 论文笔记模板 ---- */}
      <Card
        title={<span><FileTextOutlined style={{ marginRight: 8 }} />论文笔记模板</span>}
        style={{ marginBottom: 24 }}
        extra={noteTemplateIsCustom ? <Tag color="blue">自定义</Tag> : <Tag>默认</Tag>}
      >
        <Alert
          message="支持的占位符"
          description={
            <span>
              模板中可使用以下占位符，创建论文时自动替换为对应元数据：
              <code>{' {{title}} '}</code>标题（中文优先）、
              <code>{' {{title_zh}} '}</code>中文标题、
              <code>{' {{title_en}} '}</code>英文标题、
              <code>{' {{authors}} '}</code>作者、
              <code>{' {{year}} '}</code>年份、
              <code>{' {{journal}} '}</code>期刊/会议、
              <code>{' {{doi}} '}</code>DOI、
              <code>{' {{keywords}} '}</code>关键词
            </span>
          }
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Input.TextArea
          value={noteTemplate}
          onChange={(e) => setNoteTemplate(e.target.value)}
          rows={15}
          style={{ fontFamily: 'monospace', marginBottom: 12 }}
          placeholder="输入 Markdown 格式的笔记模板..."
        />

        <Space>
          <Upload
            accept=".md,.markdown,.txt"
            showUploadList={false}
            beforeUpload={handleImportTemplate}
          >
            <Button icon={<UploadOutlined />}>导入模板 .md</Button>
          </Upload>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveTemplate} loading={savingTemplate}>
            保存
          </Button>
          <Popconfirm title="确认恢复默认模板？自定义内容将被覆盖。" onConfirm={handleResetTemplate}>
            <Button icon={<ReloadOutlined />} loading={savingTemplate}>恢复默认</Button>
          </Popconfirm>
        </Space>
      </Card>
    </div>
  );
}
