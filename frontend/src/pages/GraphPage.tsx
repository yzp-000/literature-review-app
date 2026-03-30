import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  Typography, Empty, Spin, Select, Button, Space, Tag, message,
  Card, Popconfirm, Tooltip, Divider,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, FullscreenOutlined, FullscreenExitOutlined,
  AimOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ForceGraph2D from 'react-force-graph-2d';
import { useAppStore } from '../stores/useAppStore';
import { graphApi } from '../api';

const { Title, Text } = Typography;

const RELATION_OPTIONS = [
  { label: '引用 (cites)', value: 'cites' },
  { label: '被引用 (cited_by)', value: 'cited_by' },
  { label: '相关 (related_to)', value: 'related_to' },
  { label: '对比 (contrasts_with)', value: 'contrasts_with' },
  { label: '扩展 (extends)', value: 'extends' },
];

const EDGE_COLORS: Record<string, string> = {
  cites: '#1890ff',
  cited_by: '#1890ff',
  related_to: '#52c41a',
  contrasts_with: '#faad14',
  extends: '#722ed1',
};

const STATUS_LABELS: Record<string, { color: string; label: string }> = {
  unread: { color: '#bfbfbf', label: '未读' },
  reading: { color: '#1890ff', label: '阅读中' },
  completed: { color: '#52c41a', label: '已完成' },
};

const NODE_R = 6;

export default function GraphPage() {
  const { currentWorkspace, papers, fetchPapers } = useAppStore();
  const navigate = useNavigate();
  const [graphData, setGraphData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use ref for hovered node to avoid re-renders that reset the force graph
  const [hoveredNode, setHoveredNode] = useState<any>(null);
  const hoveredIdRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  // Add relation form state
  const [sourceId, setSourceId] = useState<string | undefined>();
  const [targetId, setTargetId] = useState<string | undefined>();
  const [relationType, setRelationType] = useState<string | undefined>();

  const loadGraph = useCallback(() => {
    if (!currentWorkspace) return;
    setLoading(true);
    graphApi.get(currentWorkspace)
      .then(setGraphData)
      .catch(() => setGraphData(null))
      .finally(() => setLoading(false));
  }, [currentWorkspace]);

  useEffect(() => {
    if (currentWorkspace) {
      loadGraph();
      if (!papers.length) fetchPapers();
    }
  }, [currentWorkspace]);

  const handleAddRelation = async () => {
    if (!currentWorkspace || !sourceId || !targetId || !relationType) {
      message.warning('请选择完整的关系信息');
      return;
    }
    if (sourceId === targetId) {
      message.warning('不能给论文添加与自身的关系');
      return;
    }
    try {
      await graphApi.addRelation(currentWorkspace, sourceId, targetId, relationType);
      message.success('关系添加成功');
      loadGraph();
      setSourceId(undefined);
      setTargetId(undefined);
      setRelationType(undefined);
    } catch (e: any) {
      message.error(e.response?.data?.detail || '添加失败');
    }
  };

  const handleRemoveRelation = async (source: string, target: string, type: string) => {
    if (!currentWorkspace) return;
    try {
      await graphApi.removeRelation(currentWorkspace, source, target, type);
      message.success('关系已删除');
      loadGraph();
    } catch {
      message.error('删除失败');
    }
  };

  const handleZoomToFit = () => {
    graphRef.current?.zoomToFit(400, 40);
  };

  // Memoize fgData so it only changes when graphData changes, NOT on hover/select
  const fgData = useMemo(() => {
    if (!graphData) return { nodes: [], links: [] };
    return {
      nodes: graphData.nodes.map((n: any) => ({ ...n })),
      links: graphData.edges.map((e: any) => ({
        source: e.source,
        target: e.target,
        type: e.type,
        label: e.label,
        color: EDGE_COLORS[e.type] || '#999',
      })),
    };
  }, [graphData]);

  // Stable callbacks using refs to avoid recreating on every render
  const handleNodeHover = useCallback((node: any) => {
    hoveredIdRef.current = node?.id || null;
    setHoveredNode(node || null);
  }, []);

  const handleNodeClick = useCallback((node: any) => {
    selectedIdRef.current = node?.id || null;
    setSelectedNode(node || null);
  }, []);

  const handleBgClick = useCallback(() => {
    selectedIdRef.current = null;
    setSelectedNode(null);
  }, []);

  const handleNodeDragEnd = useCallback((node: any) => {
    node.fx = node.x;
    node.fy = node.y;
  }, []);

  // Stable canvas draw callbacks using refs
  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = `#${node.number || '?'}`;
    const fontSize = Math.max(10 / globalScale, 2);
    const isHovered = hoveredIdRef.current === node.id;
    const isSelected = selectedIdRef.current === node.id;
    const r = isHovered || isSelected ? 8 : NODE_R;

    // Node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = node.color || '#bfbfbf';
    ctx.fill();

    if (isSelected) {
      ctx.strokeStyle = '#f5222d';
      ctx.lineWidth = 2 / globalScale;
      ctx.stroke();
    } else if (isHovered) {
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1.5 / globalScale;
      ctx.stroke();
    }

    // Label inside node
    ctx.font = `${fontSize}px Sans-Serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(label, node.x, node.y);

    // Title below node
    if (globalScale > 0.6) {
      const title = (node.label || '').slice(0, 15);
      const titleFontSize = Math.max(8 / globalScale, 1.5);
      ctx.font = `${titleFontSize}px Sans-Serif`;
      ctx.fillStyle = '#555';
      ctx.fillText(title, node.x, node.y + r + titleFontSize + 1);
    }
  }, []);

  // Custom hit area matching visible node size
  const nodePointerAreaPaint = useCallback((node: any, color: string, ctx: CanvasRenderingContext2D) => {
    const r = 10; // slightly larger than visual to be forgiving
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }, []);

  const linkCanvasObject = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    if (globalScale < 0.8 || !link.label) return;
    const start = link.source;
    const end = link.target;
    if (typeof start !== 'object' || typeof end !== 'object') return;
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const fontSize = Math.max(7 / globalScale, 1.2);
    ctx.font = `${fontSize}px Sans-Serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = link.color || '#999';
    ctx.fillText(link.label, midX, midY);
  }, []);

  const linkCanvasObjectMode = useCallback(() => 'after' as const, []);
  const linkColorFn = useCallback((link: any) => link.color || '#ccc', []);

  const handleEngineStop = useCallback(() => {
    graphRef.current?.zoomToFit(400, 40);
  }, []);

  if (!currentWorkspace) return <Empty description="请先选择一个课题" />;
  if (loading) return <Spin style={{ display: 'block', margin: '80px auto' }} />;

  const paperOptions = papers.map(p => ({
    label: `#${p.number} ${p.title_zh || p.title_en || '未命名'}`,
    value: p.id,
  }));

  const graphHeight = fullscreen ? window.innerHeight - 20 : Math.max(500, window.innerHeight - 340);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Title level={3} style={{ margin: 0 }}>关系图谱</Title>
        <Space>
          <Tooltip title="适应画布">
            <Button icon={<AimOutlined />} onClick={handleZoomToFit} />
          </Tooltip>
          <Tooltip title={fullscreen ? '退出全屏' : '全屏'}>
            <Button
              icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={() => setFullscreen(!fullscreen)}
            />
          </Tooltip>
        </Space>
      </div>

      {!fullscreen && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text strong style={{ flexShrink: 0 }}>添加关系：</Text>
            <Select
              placeholder="源论文"
              value={sourceId}
              onChange={setSourceId}
              options={paperOptions}
              style={{ width: 220 }}
              showSearch
              filterOption={(input, option) =>
                (option?.label as string || '').toLowerCase().includes(input.toLowerCase())
              }
              allowClear
            />
            <Select
              placeholder="关系类型"
              value={relationType}
              onChange={setRelationType}
              options={RELATION_OPTIONS}
              style={{ width: 180 }}
              allowClear
            />
            <Select
              placeholder="目标论文"
              value={targetId}
              onChange={setTargetId}
              options={paperOptions}
              style={{ width: 220 }}
              showSearch
              filterOption={(input, option) =>
                (option?.label as string || '').toLowerCase().includes(input.toLowerCase())
              }
              allowClear
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddRelation}
              disabled={!sourceId || !targetId || !relationType}
            >
              添加
            </Button>
          </div>
        </Card>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        {/* Graph area */}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            background: '#fff',
            borderRadius: 8,
            overflow: 'hidden',
            position: 'relative',
            height: graphHeight,
          }}
        >
          {fgData.nodes.length === 0 ? (
            <Empty description="暂无图谱数据，请先添加论文并设置关系" style={{ marginTop: graphHeight / 2 - 40 }} />
          ) : (
            <ForceGraph2D
              ref={graphRef}
              graphData={fgData}
              width={fullscreen ? window.innerWidth - 20 : (containerRef.current?.clientWidth || 800)}
              height={graphHeight}
              nodeLabel=""
              nodeRelSize={NODE_R}
              nodeCanvasObject={nodeCanvasObject}
              nodePointerAreaPaint={nodePointerAreaPaint}
              linkDirectionalArrowLength={4}
              linkDirectionalArrowRelPos={0.8}
              linkColor={linkColorFn}
              linkWidth={1.5}
              linkCanvasObjectMode={linkCanvasObjectMode}
              linkCanvasObject={linkCanvasObject}
              onNodeHover={handleNodeHover}
              onNodeClick={handleNodeClick}
              onNodeDragEnd={handleNodeDragEnd}
              onBackgroundClick={handleBgClick}
              cooldownTicks={80}
              onEngineStop={handleEngineStop}
            />
          )}

          {/* Legend */}
          {fgData.nodes.length > 0 && (
            <div style={{
              position: 'absolute', bottom: 12, left: 12,
              background: 'rgba(255,255,255,0.92)', padding: '8px 12px',
              borderRadius: 6, fontSize: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>节点状态</div>
              {Object.entries(STATUS_LABELS).map(([key, val]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: val.color }} />
                  <span>{val.label}</span>
                </div>
              ))}
              <Divider style={{ margin: '6px 0' }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>边类型</div>
              {Object.entries(EDGE_COLORS).map(([key, color]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <div style={{ width: 16, height: 2, background: color }} />
                  <span>{RELATION_OPTIONS.find(o => o.value === key)?.label || key}</span>
                </div>
              ))}
            </div>
          )}

          {/* Hover tooltip */}
          {hoveredNode && (
            <div style={{
              position: 'absolute', top: 12, right: 12,
              background: 'rgba(255,255,255,0.96)', padding: '10px 14px',
              borderRadius: 6, fontSize: 13, boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              maxWidth: 280, pointerEvents: 'none',
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                #{hoveredNode.number} {hoveredNode.label}
              </div>
              {hoveredNode.authors?.length > 0 && (
                <div style={{ color: '#666' }}>作者：{hoveredNode.authors.slice(0, 3).join(', ')}</div>
              )}
              {hoveredNode.year && <div style={{ color: '#666' }}>年份：{hoveredNode.year}</div>}
              {hoveredNode.journal && <div style={{ color: '#666' }}>期刊：{hoveredNode.journal}</div>}
              {hoveredNode.keywords?.length > 0 && (
                <div style={{ color: '#666' }}>关键词：{hoveredNode.keywords.slice(0, 4).join(', ')}</div>
              )}
              <Tag color={STATUS_LABELS[hoveredNode.status]?.color} style={{ marginTop: 4 }}>
                {STATUS_LABELS[hoveredNode.status]?.label || hoveredNode.status}
              </Tag>
            </div>
          )}
        </div>

        {/* Sidebar: selected node info */}
        {selectedNode && !fullscreen && (
          <Card
            size="small"
            title={`#${selectedNode.number} ${(selectedNode.label || '').slice(0, 20)}`}
            style={{ width: 280, height: 'fit-content', maxHeight: graphHeight, overflow: 'auto' }}
            extra={
              <Button type="link" size="small" onClick={() => navigate(`/papers/${selectedNode.id}`)}>
                查看详情
              </Button>
            }
          >
            {selectedNode.authors?.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary">作者：</Text>
                <Text>{selectedNode.authors.join(', ')}</Text>
              </div>
            )}
            {selectedNode.year && (
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary">年份：</Text>
                <Text>{selectedNode.year}</Text>
              </div>
            )}
            {selectedNode.keywords?.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary">关键词：</Text>
                <div>{selectedNode.keywords.map((kw: string) => <Tag key={kw}>{kw}</Tag>)}</div>
              </div>
            )}

            <Divider style={{ margin: '8px 0' }} />
            <Text strong>关系列表</Text>
            {graphData?.edges?.filter(
              (e: any) => e.source === selectedNode.id || e.target === selectedNode.id
            ).map((e: any, i: number) => {
              const isSource = e.source === selectedNode.id;
              const otherId = isSource ? e.target : e.source;
              const otherNode = graphData.nodes.find((n: any) => n.id === otherId);
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontSize: 12 }}>
                    <Tag color={EDGE_COLORS[e.type]} style={{ marginRight: 4 }}>{e.label}</Tag>
                    #{otherNode?.number || '?'} {(otherNode?.label || '').slice(0, 10)}
                  </span>
                  <Popconfirm
                    title="确认删除此关系？"
                    onConfirm={() => handleRemoveRelation(e.source, e.target, e.type)}
                  >
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </div>
              );
            })}
            {(!graphData?.edges?.some(
              (e: any) => e.source === selectedNode.id || e.target === selectedNode.id
            )) && (
              <Text type="secondary" style={{ fontSize: 12 }}>暂无关系</Text>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
