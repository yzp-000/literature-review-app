import { useEffect, useState } from 'react';
import {
  Table, Button, Tag, Space, Input, Select, Modal, Form,
  Typography, Empty, message, Popconfirm, Upload, Spin, Divider, Alert,
  Dropdown, Checkbox, Tooltip,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, UploadOutlined, SearchOutlined,
  FileAddOutlined, LinkOutlined, SettingOutlined, EditOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/useAppStore';
import { pdfApi } from '../api';

const { Title, Text } = Typography;

const STATUS_OPTIONS = [
  { label: '未读', value: 'unread' },
  { label: '阅读中', value: 'reading' },
  { label: '已完成', value: 'completed' },
];

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  unread: { color: 'default', label: '未读' },
  reading: { color: 'blue', label: '阅读中' },
  completed: { color: 'green', label: '已完成' },
};

/* All available column keys with display names */
const ALL_COLUMNS = [
  { key: 'number', label: '#' },
  { key: 'title', label: '标题' },
  { key: 'authors', label: '作者' },
  { key: 'year', label: '年份' },
  { key: 'journal', label: '期刊/会议' },
  { key: 'keywords', label: '关键词' },
  { key: 'doi', label: 'DOI' },
  { key: 'status', label: '状态' },
  { key: 'pdf', label: 'PDF' },
  { key: 'action', label: '操作' },
];

const DEFAULT_VISIBLE = ['number', 'title', 'authors', 'year', 'status', 'pdf', 'action'];
const STORAGE_KEY = 'papers_visible_columns';

function loadVisibleColumns(): string[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return DEFAULT_VISIBLE;
}

export default function PapersPage() {
  const { currentWorkspace, papers, loadingPapers, fetchPapers, createPaper, updatePaper, deletePaper } = useAppStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPaper, setEditingPaper] = useState<any>(null);
  const [form] = Form.useForm();
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const navigate = useNavigate();

  // Column visibility
  const [visibleCols, setVisibleCols] = useState<string[]>(loadVisibleColumns);

  const handleVisibleChange = (keys: string[]) => {
    // Always keep title and action visible
    const next = Array.from(new Set([...keys, 'title', 'action']));
    setVisibleCols(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  // PDF import states
  const [importing, setImporting] = useState(false);
  const [parsedMeta, setParsedMeta] = useState<any>(null);
  const [pdfRelPath, setPdfRelPath] = useState('');

  useEffect(() => {
    if (currentWorkspace) fetchPapers();
  }, [currentWorkspace]);

  if (!currentWorkspace) {
    return <Empty description="请先选择一个课题" />;
  }

  const filteredPapers = papers.filter(p => {
    if (statusFilter && p.status !== statusFilter) return false;
    if (searchKeyword) {
      const kw = searchKeyword.toLowerCase();
      return (
        (p.title_zh || '').toLowerCase().includes(kw) ||
        (p.title_en || '').toLowerCase().includes(kw) ||
        p.authors.join(' ').toLowerCase().includes(kw) ||
        p.keywords.join(' ').toLowerCase().includes(kw)
      );
    }
    return true;
  });

  // ---- Manual add (no PDF) ----
  const openManualAdd = () => {
    setEditingPaper(null);
    setParsedMeta(null);
    setPdfRelPath('');
    form.resetFields();
    form.setFieldsValue({ status: 'unread' });
    setModalOpen(true);
  };

  // ---- Edit existing paper ----
  const openEdit = (record: any) => {
    setEditingPaper(record);
    setParsedMeta(null);
    setPdfRelPath('');
    form.resetFields();
    form.setFieldsValue({
      title_zh: record.title_zh || '',
      title_en: record.title_en || '',
      authors: (record.authors || []).join(', '),
      year: record.year || undefined,
      journal: record.journal || '',
      doi: record.doi || '',
      keywords: (record.keywords || []).join(', '),
      status: record.status || 'unread',
    });
    setModalOpen(true);
  };

  // ---- PDF import: upload → parse → pre-fill form ----
  const handlePdfImport = async (file: File) => {
    if (!currentWorkspace) return false;
    setImporting(true);
    try {
      const result = await pdfApi.upload(currentWorkspace, file);
      const meta = result.metadata || {};
      setParsedMeta(meta);
      setPdfRelPath(result.path);

      form.resetFields();
      form.setFieldsValue({
        title_zh: meta.title_zh || '',
        title_en: meta.title_en || '',
        authors: (meta.authors || []).join(', '),
        year: meta.year || undefined,
        journal: meta.journal || '',
        doi: meta.doi || '',
        keywords: (meta.keywords || []).join(', '),
        status: 'unread',
      });
      setModalOpen(true);
    } catch (e: any) {
      message.error('PDF 上传解析失败: ' + (e.response?.data?.detail || e.message));
    }
    setImporting(false);
    return false;
  };

  // ---- Attach PDF to an existing paper ----
  const handlePdfUploadForPaper = async (file: File, paperId: string) => {
    try {
      await pdfApi.upload(currentWorkspace, file, paperId);
      message.success('PDF 上传成功');
      fetchPapers();
    } catch {
      message.error('上传失败');
    }
    return false;
  };

  // ---- Create or update paper ----
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (typeof values.authors === 'string') {
        values.authors = values.authors.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean);
      }
      if (typeof values.keywords === 'string') {
        values.keywords = values.keywords.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean);
      }

      if (editingPaper) {
        await updatePaper(editingPaper.id, values);
        message.success('论文信息已更新');
      } else {
        if (pdfRelPath) {
          values.pdf_path = pdfRelPath;
        }
        await createPaper(values);
        message.success(pdfRelPath ? 'PDF 导入并创建论文成功' : '论文添加成功');
      }
      setModalOpen(false);
      form.resetFields();
      setEditingPaper(null);
      setParsedMeta(null);
      setPdfRelPath('');
      fetchPapers();
    } catch (e: any) {
      if (e.errorFields) return;
      message.error((editingPaper ? '更新' : '添加') + '失败: ' + (e.message || ''));
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    await updatePaper(id, { status });
  };

  const handleDelete = async (id: string) => {
    await deletePaper(id);
    message.success('已删除');
  };

  /* ====== Column definitions ====== */
  const allColumnDefs: Record<string, any> = {
    number: {
      title: '#',
      dataIndex: 'number',
      key: 'number',
      width: 50,
      sorter: (a: any, b: any) => a.number - b.number,
    },
    title: {
      title: '标题',
      key: 'title',
      ellipsis: true,
      render: (_: any, r: any) => {
        const displayTitle = r.title_zh || r.title_en || '未命名';
        return (
          <div>
            <Tooltip title={displayTitle} placement="topLeft">
              <a
                onClick={() => navigate(`/papers/${r.id}`)}
                style={{ fontWeight: 500 }}
              >
                {displayTitle}
              </a>
            </Tooltip>
            {r.doi && (
              <a
                href={`https://doi.org/${r.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ marginLeft: 6, fontSize: 12, flexShrink: 0 }}
                title={r.doi}
              >
                <LinkOutlined /> DOI
              </a>
            )}
          </div>
        );
      },
    },
    authors: {
      title: '作者',
      dataIndex: 'authors',
      key: 'authors',
      width: 160,
      ellipsis: true,
      render: (a: string[]) => {
        const text = a?.join(', ') || '-';
        return <Tooltip title={text} placement="topLeft"><span>{text}</span></Tooltip>;
      },
    },
    year: {
      title: '年份',
      dataIndex: 'year',
      key: 'year',
      width: 70,
      sorter: (a: any, b: any) => (a.year || 0) - (b.year || 0),
    },
    journal: {
      title: '期刊/会议',
      dataIndex: 'journal',
      key: 'journal',
      width: 150,
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    keywords: {
      title: '关键词',
      dataIndex: 'keywords',
      key: 'keywords',
      width: 180,
      ellipsis: true,
      render: (kws: string[]) => {
        if (!kws || kws.length === 0) return '-';
        return (
          <Tooltip title={kws.join(', ')} placement="topLeft">
            <span>{kws.slice(0, 3).join(', ')}{kws.length > 3 ? ' ...' : ''}</span>
          </Tooltip>
        );
      },
    },
    doi: {
      title: 'DOI',
      dataIndex: 'doi',
      key: 'doi',
      width: 140,
      ellipsis: true,
      render: (d: string) =>
        d ? (
          <a href={`https://doi.org/${d}`} target="_blank" rel="noopener noreferrer" title={d}>
            {d}
          </a>
        ) : '-',
    },
    status: {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (s: string) => {
        const info = STATUS_MAP[s] || STATUS_MAP.unread;
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    pdf: {
      title: 'PDF',
      key: 'pdf',
      width: 80,
      render: (_: any, r: any) =>
        r.pdf_path ? (
          <Tag color="blue">已上传</Tag>
        ) : (
          <Upload
            accept=".pdf"
            showUploadList={false}
            beforeUpload={(file) => { handlePdfUploadForPaper(file, r.id); return false; }}
          >
            <Button size="small" icon={<UploadOutlined />}>上传</Button>
          </Upload>
        ),
    },
    action: {
      title: '操作',
      key: 'action',
      width: 170,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Select
            size="small"
            value={r.status}
            onChange={(v) => handleStatusChange(r.id, v)}
            options={STATUS_OPTIONS}
            style={{ width: 80 }}
          />
          <Tooltip title="编辑">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          </Tooltip>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  };

  const columns = ALL_COLUMNS
    .filter(c => visibleCols.includes(c.key))
    .map(c => allColumnDefs[c.key]);

  /* ====== Column picker dropdown content ====== */
  const columnPickerContent = (
    <div style={{ padding: '8px 12px', background: '#fff', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
      <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 13 }}>显示列</div>
      <Checkbox.Group
        value={visibleCols}
        onChange={(vals) => handleVisibleChange(vals as string[])}
        style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
      >
        {ALL_COLUMNS.map(c => (
          <Checkbox
            key={c.key}
            value={c.key}
            disabled={c.key === 'title' || c.key === 'action'}
          >
            {c.label}
          </Checkbox>
        ))}
      </Checkbox.Group>
      <Divider style={{ margin: '8px 0' }} />
      <a onClick={() => handleVisibleChange(DEFAULT_VISIBLE)} style={{ fontSize: 12 }}>
        恢复默认
      </a>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>论文管理</Title>
        <Space>
          <Upload
            accept=".pdf"
            showUploadList={false}
            multiple={false}
            beforeUpload={handlePdfImport}
          >
            <Button type="primary" icon={<FileAddOutlined />} loading={importing}>
              导入 PDF
            </Button>
          </Upload>
          <Button icon={<PlusOutlined />} onClick={openManualAdd}>
            手动添加
          </Button>
        </Space>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space>
          <Input
            placeholder="搜索标题/作者/关键词"
            prefix={<SearchOutlined />}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            allowClear
            style={{ width: 240 }}
          />
          <Select
            placeholder="状态筛选"
            value={statusFilter}
            onChange={setStatusFilter}
            allowClear
            options={STATUS_OPTIONS}
            style={{ width: 110 }}
          />
        </Space>
        <Dropdown
          trigger={['click']}
          dropdownRender={() => columnPickerContent}
        >
          <Button icon={<SettingOutlined />}>
            显示列
          </Button>
        </Dropdown>
      </div>

      <Table
        dataSource={filteredPapers}
        columns={columns}
        rowKey="id"
        loading={loadingPapers}
        size="middle"
        pagination={{ pageSize: 20, showSizeChanger: true }}
        tableLayout="fixed"
      />

      {/* ===== Add / Import Modal ===== */}
      <Modal
        title={editingPaper ? '编辑论文信息' : parsedMeta ? '导入 PDF — 确认论文信息' : '添加论文'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditingPaper(null); setParsedMeta(null); setPdfRelPath(''); }}
        okText={editingPaper ? '保存' : parsedMeta ? '确认导入' : '添加'}
        cancelText="取消"
        width={660}
      >
        {parsedMeta && (
          <Alert
            message="已从 PDF 自动提取以下信息，请核对并补充缺失字段"
            type="success"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <Form form={form} layout="vertical" size="middle">
          <Form.Item
            name="title_zh"
            label="中文标题"
            rules={[{
              validator: (_, val) => {
                const en = form.getFieldValue('title_en');
                if (!val && !en) return Promise.reject('中文标题和英文标题至少填写一个');
                return Promise.resolve();
              },
            }]}
          >
            <Input placeholder="论文中文标题" />
          </Form.Item>
          <Form.Item name="title_en" label="英文标题">
            <Input placeholder="Paper English Title" />
          </Form.Item>
          <Form.Item name="authors" label="作者（逗号分隔）">
            <Input placeholder="张三, 李四, Wang Wu" />
          </Form.Item>
          <Form.Item name="year" label="年份">
            <Input type="number" placeholder="2024" />
          </Form.Item>
          <Form.Item name="journal" label="期刊/会议">
            <Input placeholder="期刊或会议名称" />
          </Form.Item>
          <Form.Item name="doi" label="DOI">
            <Input placeholder="10.xxxx/xxxxx" />
          </Form.Item>
          <Form.Item name="keywords" label="关键词（逗号分隔）">
            <Input placeholder="关键词1, 关键词2" />
          </Form.Item>
          <Form.Item name="status" label="阅读状态" initialValue="unread">
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
        </Form>

        {parsedMeta?.abstract && (
          <>
            <Divider />
            <div>
              <Text strong>摘要（自动提取）：</Text>
              <div style={{ marginTop: 4, padding: '8px 12px', background: '#fafafa', borderRadius: 4, fontSize: 13, maxHeight: 140, overflow: 'auto' }}>
                {parsedMeta.abstract}
              </div>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
