'use client';
import React from 'react';

const ScenarioToggle = ({ isOptimistic, onToggle }: { isOptimistic: boolean, onToggle: () => void }) => {
  return (
    <div className="flex items-center justify-center my-4">
      <span className={`mr-3 text-sm font-medium ${!isOptimistic ? 'text-white' : 'text-gray-400'}`}>Pessimistic</span>
      <label className="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" checked={isOptimistic} onChange={onToggle} className="sr-only peer" />
        <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:ring-4 peer-focus:ring-cyan-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
      </label>
      <span className={`ml-3 text-sm font-medium ${isOptimistic ? 'text-white' : 'text-gray-400'}`}>Optimistic</span>
    </div>
  );
};

export default ScenarioToggle;
