import { useState, useEffect } from 'react';
import { Modal, List, Breadcrumb, Spin, Empty, Input, Button, Space, Typography, message } from 'antd';
import { FolderOutlined, FolderOpenOutlined, ArrowUpOutlined, HomeOutlined, PlusOutlined } from '@ant-design/icons';
import { settingsApi } from '../api';

const { Text } = Typography;

interface DirEntry {
  name: string;
  path: string;
}

interface BrowseResult {
  current: string;
  parent: string | null;
  children: DirEntry[];
}

interface FolderPickerProps {
  open: boolean;
  initialPath?: string;
  onOk: (path: string) => void;
  onCancel: () => void;
}

export default function FolderPicker({ open, initialPath, onOk, onCancel }: FolderPickerProps) {
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [children, setChildren] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [pathInput, setPathInput] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  const browse = async (path?: string) => {
    setLoading(true);
    try {
      const data: BrowseResult = await settingsApi.browseDir(path);
      setCurrentPath(data.current);
      setParentPath(data.parent);
      setChildren(data.children);
      setPathInput(data.current);
    } catch (e: any) {
      message.error(e.response?.data?.detail || '无法访问该目录');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      browse(initialPath || undefined);
      setNewFolderName('');
      setCreatingFolder(false);
    }
  }, [open, initialPath]);

  const handleGoUp = () => {
    if (parentPath) browse(parentPath);
  };

  const handleEnterDir = (path: string) => {
    browse(path);
  };

  const handlePathInputGo = () => {
    if (pathInput.trim()) browse(pathInput.trim());
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    if (name.includes('/') || name.includes('\\') || name === '..') {
      message.error('文件夹名不能包含路径分隔符');
      return;
    }
    const newPath = currentPath.replace(/\/+$/, '') + '/' + name;
    try {
      await settingsApi.mkdir(newPath);
      setNewFolderName('');
      setCreatingFolder(false);
      browse(currentPath);
      message.success(`已创建文件夹: ${name}`);
    } catch (e: any) {
      message.error(e.response?.data?.detail || '创建失败');
    }
  };

  // Split current path into breadcrumb segments
  const segments = currentPath ? currentPath.split('/').filter(Boolean) : [];

  return (
    <Modal
      title="选择文件夹"
      open={open}
      onOk={() => onOk(currentPath)}
      onCancel={onCancel}
      okText="选择此文件夹"
      cancelText="取消"
      width={640}
      styles={{ body: { padding: '12px 0' } }}
    >
      {/* Address bar */}
      <Space.Compact style={{ width: '100%', marginBottom: 12, padding: '0 12px' }}>
        <Input
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          onPressEnter={handlePathInputGo}
          placeholder="输入路径后回车跳转"
          style={{ flex: 1 }}
        />
        <Button onClick={handlePathInputGo}>跳转</Button>
      </Space.Compact>

      {/* Breadcrumb + up button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '0 12px' }}>
        <Button
          size="small"
          icon={<ArrowUpOutlined />}
          disabled={!parentPath}
          onClick={handleGoUp}
        />
        <Button
          size="small"
          icon={<HomeOutlined />}
          onClick={() => browse(undefined)}
        />
        <Breadcrumb
          style={{ flex: 1 }}
          items={[
            { title: <a onClick={() => browse('/')}>/</a> },
            ...segments.map((seg, i) => {
              const segPath = '/' + segments.slice(0, i + 1).join('/');
              return {
                title: i === segments.length - 1
                  ? <Text strong>{seg}</Text>
                  : <a onClick={() => browse(segPath)}>{seg}</a>,
              };
            }),
          ]}
        />
      </div>

      {/* Selected path display */}
      <div style={{ padding: '6px 12px', marginBottom: 8, background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 4 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>当前选中：</Text>
        <Text strong code style={{ fontSize: 13 }}>{currentPath}</Text>
      </div>

      {/* Directory listing */}
      <div style={{ height: 340, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 4, margin: '0 12px' }}>
        {loading ? (
          <Spin style={{ display: 'block', margin: '80px auto' }} />
        ) : children.length === 0 ? (
          <Empty description="此目录下没有子文件夹" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 60 }} />
        ) : (
          <List
            size="small"
            dataSource={children}
            renderItem={(item) => (
              <List.Item
                style={{ cursor: 'pointer', padding: '8px 16px' }}
                onClick={() => handleEnterDir(item.path)}
                onDoubleClick={() => {
                  handleEnterDir(item.path);
                }}
              >
                <Space>
                  <FolderOutlined style={{ color: '#faad14', fontSize: 18 }} />
                  <Text>{item.name}</Text>
                </Space>
              </List.Item>
            )}
          />
        )}
      </div>

      {/* New folder */}
      <div style={{ marginTop: 12, padding: '0 12px' }}>
        {creatingFolder ? (
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder="新文件夹名称"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onPressEnter={handleCreateFolder}
              autoFocus
            />
            <Button type="primary" onClick={handleCreateFolder}>创建</Button>
            <Button onClick={() => { setCreatingFolder(false); setNewFolderName(''); }}>取消</Button>
          </Space.Compact>
        ) : (
          <Button icon={<PlusOutlined />} size="small" onClick={() => setCreatingFolder(true)}>
            新建文件夹
          </Button>
        )}
      </div>
    </Modal>
  );
}
