// src/components/ChartThumbnail.jsx
import React from 'react';
import ChartRenderer from './ChartRenderer';

export default function ChartThumbnail({ item, onOpen }) {
  // item: { spec, aggregated }
  const { spec, aggregated } = item;
  return (
    <div className="border rounded p-2 shadow-sm hover:shadow-md cursor-pointer" style={{ background: 'white' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">{spec.title || `${spec.type} chart`}</div>
        <button onClick={() => onOpen(item)} className="text-xs px-2 py-1 bg-blue-600 text-white rounded">Open</button>
      </div>
      <div style={{ height: 140 }}>
        <ChartRenderer spec={spec} aggregated={aggregated} height={140} />
      </div>
    </div>
  );
}

