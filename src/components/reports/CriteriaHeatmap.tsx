import React from 'react';

export interface CriteriaStat {
  group: string;
  avgScore: number;
  percentage: number;
  groupId?: string;
  versionId?: string;
  setKey?: string | null;
  configVersion?: number | null;
  label?: string;
  name?: string;
}

export interface CriteriaHeatmapProps {
  data?: CriteriaStat[];
  mixedSets?: boolean;
  note?: string | null;
}

export default function CriteriaHeatmap({ data = [], mixedSets, note }: CriteriaHeatmapProps) {
  const getStatusColor = (percentage: number) => {
    if (percentage >= 80) return 'text-green-600 bg-green-50 border-green-100 ring-green-500/20';
    if (percentage >= 50) return 'text-amber-600 bg-amber-50 border-amber-100 ring-amber-500/20';
    return 'text-red-600 bg-red-50 border-red-100 ring-red-500/20';
  };

  const getProgressBg = (percentage: number) => {
    if (percentage >= 80) return 'bg-green-500';
    if (percentage >= 50) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const groupNames: Record<string, string> = {
    'A': 'Kỷ luật',
    'B': 'Hợp tác',
    'C': 'Tích cực',
    'D': 'Trách nhiệm',
    'E': 'Năng lực',
    'F': 'Thành tích',
  };

  const sections = React.useMemo(() => {
    const map = new Map<string, { key: string; label: string; items: CriteriaStat[] }>();
    for (const item of data) {
      const sKey = `${item.setKey ?? ''}:${item.versionId ?? ''}`;
      let sec = map.get(sKey);
      if (!sec) {
        sec = {
          key: sKey,
          label: item.label || 'Tiêu chuẩn',
          items: [],
        };
        map.set(sKey, sec);
      }
      sec.items.push(item);
    }
    return [...map.values()];
  }, [data]);

  const isMixed = mixedSets ?? (sections.length > 1);
  const displayNote = note || (isMixed ? 'Không so sánh trực tiếp giữa các bộ tiêu chí' : null);

  return (
    <div
      data-load-layer="heavy"
      className="bg-surface-raised p-6 rounded-3xl border border-outline-soft shadow-sm"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-ink">Phân tích nhóm tiêu chuẩn</h3>
        <div className="flex gap-4 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span>≥80%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
            <span>50-79%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-red-500"></div>
            <span>{'<'}50%</span>
          </div>
        </div>
      </div>

      {isMixed && displayNote && (
        <div className="mb-6 p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-800 text-xs font-semibold flex items-center gap-2">
          <span>{displayNote}</span>
        </div>
      )}

      {data.length === 0 ? (
        <div className="py-8 text-center text-ink-muted text-xs italic">
          Chưa có dữ liệu phân tích tiêu chuẩn
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map((section) => (
            <div key={section.key} className="space-y-3">
              {sections.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-surface-muted border border-outline-soft text-ink">
                    {section.label}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {section.items.map((item) => {
                  const cardKey = `${item.versionId || 'default'}:${item.groupId || item.group}`;
                  const displayName = item.name || groupNames[item.group] || 'Khác';
                  return (
                    <div
                      key={cardKey}
                      data-criteria-key={cardKey}
                      className={`relative p-4 rounded-2xl border transition-all hover:shadow-md hover:-translate-y-0.5 group overflow-hidden ${getStatusColor(item.percentage)}`}
                    >
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold opacity-70">Nhóm {item.group}</span>
                          <span className="text-xs font-bold">{item.percentage.toFixed(0)}%</span>
                        </div>
                        <h4 className="text-sm font-bold mb-1 truncate">{displayName}</h4>
                        {item.label && (
                          <div className="text-[11px] text-ink-muted mb-2 truncate">
                            {item.label}
                          </div>
                        )}
                        <div className="text-2xl font-black">{item.avgScore.toFixed(1)}</div>
                        <div className="mt-1 text-[10px] text-ink-muted/70 font-mono truncate" title={cardKey}>
                          {cardKey}
                        </div>
                      </div>

                      {/* Background progress indicator */}
                      <div
                        className={`absolute bottom-0 left-0 h-1 transition-all duration-1000 ${getProgressBg(item.percentage)} opacity-30`}
                        style={{ width: `${item.percentage}%` }}
                      />

                      {/* Subtle glass effect on hover */}
                      <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors pointer-events-none" />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 p-4 bg-surface-muted rounded-2xl border border-outline-soft">
        <p className="text-xs text-ink-muted leading-relaxed">
          <span className="font-bold text-ink">Mẹo:</span> Nhóm tiêu chuẩn có tỉ lệ dưới 50% cần được chú trọng đào tạo hoặc điều chỉnh quy trình vận hành thực tế.
        </p>
      </div>
    </div>
  );
}
