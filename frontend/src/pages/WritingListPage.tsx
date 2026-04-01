import { useState, useEffect } from 'react';
import {
  Card, Button, Input, List, Modal, Typography, Space, Tag, Popconfirm, message, Radio,
} from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useWritingStore } from '../stores/useWritingStore';

const { Title, Text } = Typography;

export default function WritingListPage() {
  const { projects, fetchProjects, createProject, deleteProject } = useWritingStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [template, setTemplate] = useState('default');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createProject(newName.trim(), template);
      message.success(`写作项目「${newName.trim()}」创建成功`);
      setModalOpen(false);
      setNewName('');
      setTemplate('default');
    } catch (e: any) {
      message.error(e.response?.data?.detail || '创建失败');
    }
    setCreating(false);
  };

  const handleDelete = async (name: string) => {
    try {
      await deleteProject(name);
      message.success('已删除');
    } catch {
      message.error('删除失败');
    }
  };

  const statusColor = (s: string) => {
    if (s === 'success') return 'green';
    if (s === 'error') return 'red';
    return 'default';
  };

  const statusText = (s: string) => {
    if (s === 'success') return '编译成功';
    if (s === 'error') return '编译失败';
    return '未编译';
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>论文写作</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          新建项目
        </Button>
      </div>

      <List
        grid={{ gutter: 16, xs: 1, sm: 2, md: 3, lg: 3 }}
        dataSource={projects}
        locale={{ emptyText: '暂无写作项目，点击右上角新建' }}
        renderItem={(proj) => (
          <List.Item>
            <Card
              hoverable
              onClick={() => navigate(`/writing/${encodeURIComponent(proj.name)}`)}
              actions={[
                <Button
                  type="link"
                  icon={<EditOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/writing/${encodeURIComponent(proj.name)}`);
                  }}
                >
                  编辑
                </Button>,
                <Popconfirm
                  title="确认删除此项目？"
                  description="将永久删除所有相关文件"
                  onConfirm={(e) => { e?.stopPropagation(); handleDelete(proj.name); }}
                  onCancel={(e) => e?.stopPropagation()}
                >
                  <Button
                    type="link"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={(e) => e.stopPropagation()}
                  >
                    删除
                  </Button>
                </Popconfirm>,
              ]}
            >
              <Card.Meta
                title={<span style={{ fontSize: 14 }}>{proj.name}</span>}
                description={
                  <Space size={12} direction="vertical">
                    <Space size={8}>
                      <Tag color={statusColor(proj.compile_status)}>{statusText(proj.compile_status)}</Tag>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      创建于 {new Date(proj.created_at).toLocaleDateString('zh-CN')}
                    </Text>
                  </Space>
                }
              />
            </Card>
          </List.Item>
        )}
      />

      <Modal
        title="新建写作项目"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => { setModalOpen(false); setNewName(''); setTemplate('default'); }}
        confirmLoading={creating}
        okText="创建"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong>项目名称</Text>
          <Input
            placeholder="请输入项目名称（如：基于深度学习的目标检测综述）"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onPressEnter={handleCreate}
            autoFocus
            style={{ marginTop: 8 }}
          />
        </div>
        <div>
          <Text strong>模板选择</Text>
          <div style={{ marginTop: 8 }}>
            <Radio.Group value={template} onChange={(e) => setTemplate(e.target.value)}>
              <Radio value="default">标准论文模板（含 ctex 中文支持）</Radio>
              <Radio value="blank">空白模板</Radio>
            </Radio.Group>
          </div>
        </div>
      </Modal>
    </div>
  );
}
