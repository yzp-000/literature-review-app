import { useState, useEffect } from 'react';
import {
  Card, Button, Input, List, Modal, Typography, Space, Tag, Popconfirm, message,
  Row, Col, Statistic, Empty, Divider,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, FolderOpenOutlined,
  FileTextOutlined, ReadOutlined, CheckCircleOutlined, BookOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/useAppStore';
import { fileApi } from '../api';

const { Title, Text } = Typography;

export default function WorkspacePage() {
  const {
    workspaces, currentWorkspace,
    fetchWorkspaces, createWorkspace, deleteWorkspace, setCurrentWorkspace,
    papers, fetchPapers,
  } = useAppStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [mdFiles, setMdFiles] = useState<any[]>([]);
  const navigate = useNavigate();

  // Load overview data when workspace is selected
  useEffect(() => {
    if (currentWorkspace) {
      fetchPapers();
      fileApi.list(currentWorkspace).then(setMdFiles).catch(() => {});
    }
  }, [currentWorkspace]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createWorkspace(newName.trim());
      message.success(`课题「${newName.trim()}」创建成功`);
      setModalOpen(false);
      setNewName('');
    } catch (e: any) {
      message.error(e.response?.data?.detail || '创建失败');
    }
    setCreating(false);
  };

  const handleOpen = (name: string) => {
    setCurrentWorkspace(name);
  };

  const handleDelete = async (name: string) => {
    try {
      await deleteWorkspace(name);
      message.success('已删除');
    } catch {
      message.error('删除失败');
    }
  };

  const statusCounts = {
    unread: papers.filter(p => p.status === 'unread').length,
    reading: papers.filter(p => p.status === 'reading').length,
    completed: papers.filter(p => p.status === 'completed').length,
  };

  const recentPapers = [...papers].sort((a, b) => {
    return (b.number || 0) - (a.number || 0);
  }).slice(0, 6);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* ====== Workspace list ====== */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>课题管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          新建课题
        </Button>
      </div>

      <List
        grid={{ gutter: 16, xs: 1, sm: 2, md: 3, lg: 3 }}
        dataSource={workspaces}
        locale={{ emptyText: '暂无课题，点击右上角新建' }}
        renderItem={(ws) => {
          const isActive = ws.name === currentWorkspace;
          return (
            <List.Item>
              <Card
                hoverable
                onClick={() => handleOpen(ws.name)}
                style={isActive ? { borderColor: '#1890ff', borderWidth: 2 } : {}}
                actions={[
                  <Button
                    type="link"
                    icon={<FolderOpenOutlined />}
                    onClick={(e) => { e.stopPropagation(); handleOpen(ws.name); }}
                  >
                    {isActive ? '当前课题' : '选择'}
                  </Button>,
                  <Popconfirm
                    title="确认删除此课题？"
                    description="将永久删除所有相关文件"
                    onConfirm={(e) => { e?.stopPropagation(); handleDelete(ws.name); }}
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
                  title={
                    <Space>
                      <span style={{ fontSize: 14 }}>{ws.name}</span>
                      {isActive && <Tag color="blue">当前</Tag>}
                    </Space>
                  }
                  description={
                    <Space size={12}>
                      <Text type="secondary">{ws.paper_count} 篇论文</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(ws.created_at).toLocaleDateString('zh-CN')}
                      </Text>
                    </Space>
                  }
                />
              </Card>
            </List.Item>
          );
        }}
      />

      {/* ====== Dashboard overview (shows when a workspace is selected) ====== */}
      {currentWorkspace && (
        <>
          <Divider />
          <Title level={4} style={{ marginBottom: 16 }}>
            课题概览：{currentWorkspace}
          </Title>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic title="论文总数" value={papers.length} prefix={<FileTextOutlined />} />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic title="未读" value={statusCounts.unread} prefix={<BookOutlined />} valueStyle={{ color: '#999' }} />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic title="阅读中" value={statusCounts.reading} prefix={<ReadOutlined />} valueStyle={{ color: '#1890ff' }} />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic title="已完成" value={statusCounts.completed} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} />
              </Card>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Card title="最近论文" size="small">
                {recentPapers.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无论文" />
                ) : (
                  <List
                    size="small"
                    dataSource={recentPapers}
                    renderItem={(p) => (
                      <List.Item
                        style={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/papers/${p.id}`)}
                      >
                        <div>
                          <Tag color={p.status === 'completed' ? 'green' : p.status === 'reading' ? 'blue' : 'default'}>
                            {p.status === 'completed' ? '已完成' : p.status === 'reading' ? '阅读中' : '未读'}
                          </Tag>
                          <Text>#{p.number} {p.title_zh || p.title_en || '未命名'}</Text>
                        </div>
                      </List.Item>
                    )}
                  />
                )}
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="文档文件" size="small">
                {mdFiles.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无文件" />
                ) : (
                  <List
                    size="small"
                    dataSource={mdFiles.slice(0, 8)}
                    renderItem={(f) => (
                      <List.Item>
                        <Text ellipsis style={{ maxWidth: 400 }}>{f.path}</Text>
                      </List.Item>
                    )}
                  />
                )}
              </Card>
            </Col>
          </Row>
        </>
      )}

      {/* ====== Create modal ====== */}
      <Modal
        title="新建课题"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => { setModalOpen(false); setNewName(''); }}
        confirmLoading={creating}
        okText="创建"
        cancelText="取消"
      >
        <Input
          placeholder="请输入课题名称（如：感知缺失场景焊接机械臂运动规划）"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onPressEnter={handleCreate}
          autoFocus
        />
      </Modal>
    </div>
  );
}
