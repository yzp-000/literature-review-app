import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Select, Typography, Space } from 'antd';
import {
  FileTextOutlined,
  SearchOutlined,
  ApartmentOutlined,
  ExportOutlined,
  SettingOutlined,
  FolderOutlined,
  QuestionCircleOutlined,
  FormOutlined,
} from '@ant-design/icons';
import { useEffect } from 'react';
import { useAppStore } from './stores/useAppStore';
import WorkspacePage from './pages/WorkspacePage';
import PapersPage from './pages/PapersPage';
import PaperDetailPage from './pages/PaperDetailPage';
import SearchPage from './pages/SearchPage';
import GraphPage from './pages/GraphPage';
import ExportPage from './pages/ExportPage';
import SettingsPage from './pages/SettingsPage';
import GuidePage from './pages/GuidePage';
import WritingListPage from './pages/WritingListPage';
import WritingPage from './pages/WritingPage';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { workspaces, currentWorkspace, fetchWorkspaces, setCurrentWorkspace } = useAppStore();

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const menuItems = [
    { key: '/workspaces', icon: <FolderOutlined />, label: '课题管理' },
    { key: '/papers', icon: <FileTextOutlined />, label: '论文管理', disabled: !currentWorkspace },
    { key: '/search', icon: <SearchOutlined />, label: '文献检索', disabled: !currentWorkspace },
    { key: '/graph', icon: <ApartmentOutlined />, label: '关系图谱', disabled: !currentWorkspace },
    { key: '/export', icon: <ExportOutlined />, label: '导出', disabled: !currentWorkspace },
    { key: '/writing', icon: <FormOutlined />, label: '论文写作' },
    { key: '/settings', icon: <SettingOutlined />, label: '设置' },
    { key: '/guide', icon: <QuestionCircleOutlined />, label: '使用说明' },
  ];

  const selectedKey = '/' + location.pathname.split('/')[1];
  const isWritingEditor = location.pathname.match(/^\/writing\/[^/]+$/);

  return (
    <Layout>
      <Sider width={220} theme="light" style={{ borderRight: '1px solid #f0f0f0', height: '100vh', overflow: 'auto' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0' }}>
          <Title level={4} style={{ margin: 0, fontSize: '16px' }}>文献调研管理</Title>
        </div>
        <div style={{ padding: '8px 12px' }}>
          <Select
            placeholder="选择课题"
            value={currentWorkspace}
            onChange={(val) => {
              setCurrentWorkspace(val);
              navigate('/workspaces');
            }}
            style={{ width: '100%' }}
            allowClear
            onClear={() => setCurrentWorkspace(null)}
            options={workspaces.map((ws) => ({ label: ws.name, value: ws.name }))}
          />
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ border: 'none' }}
        />
      </Sider>
      <Layout>
        <Content style={{
          padding: isWritingEditor ? 0 : '16px',
          overflow: isWritingEditor ? 'hidden' : 'auto',
          background: '#f5f5f5',
          height: '100vh',
        }}>
          <Routes>
            <Route path="/workspaces" element={<WorkspacePage />} />
            <Route path="/papers" element={<PapersPage />} />
            <Route path="/papers/:paperId" element={<PaperDetailPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/graph" element={<GraphPage />} />
            <Route path="/export" element={<ExportPage />} />
            <Route path="/writing" element={<WritingListPage />} />
            <Route path="/writing/:projectName" element={<WritingPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/guide" element={<GuidePage />} />
            <Route path="*" element={<Navigate to="/workspaces" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default App;
