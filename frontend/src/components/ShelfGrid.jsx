// src/components/ShelfGrid.jsx — Interactive shelf grid with hover + click
import { useState, useCallback } from 'react';
import { Package, AlertTriangle, X } from 'lucide-react';

// Color system per cell state
const CELL_COLORS = {
  // Stocked items
  bottle:        { bg: 'bg-primary-50', border: 'border-primary-400', text: 'text-primary-700', dot: 'bg-primary-500' },
  chips:         { bg: 'bg-yellow-50',  border: 'border-yellow-400',  text: 'text-yellow-700',  dot: 'bg-yellow-500' },
  juice:         { bg: 'bg-orange-50',  border: 'border-orange-400',  text: 'text-orange-700',  dot: 'bg-orange-500' },
  water:         { bg: 'bg-blue-50',    border: 'border-blue-400',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  cola:          { bg: 'bg-red-50',     border: 'border-red-400',     text: 'text-red-700',     dot: 'bg-red-500' },
  snack:         { bg: 'bg-purple-50',  border: 'border-purple-400',  text: 'text-purple-700',  dot: 'bg-purple-500' },
  cereal:        { bg: 'bg-amber-50',   border: 'border-amber-400',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  yogurt:        { bg: 'bg-pink-50',    border: 'border-pink-400',    text: 'text-pink-700',    dot: 'bg-pink-500' },
  candy:         { bg: 'bg-fuchsia-50', border: 'border-fuchsia-400', text: 'text-fuchsia-700', dot: 'bg-fuchsia-500' },
  'energy drink':{ bg: 'bg-lime-50',   border: 'border-lime-400',    text: 'text-lime-700',    dot: 'bg-lime-500' },
  cup:           { bg: 'bg-teal-50',   border: 'border-teal-400',    text: 'text-teal-700',    dot: 'bg-teal-500' },
  // Default for unknown items
  _default:      { bg: 'bg-primary-50', border: 'border-primary-300', text: 'text-primary-700', dot: 'bg-primary-400' },
};

function getCellStyle(item) {
  if (item === 'empty') return null;
  return CELL_COLORS[item.toLowerCase()] || CELL_COLORS._default;
}

function getItemEmoji(item) {
  const map = {
    bottle: '🍶', chips: '🍟', juice: '🧃', water: '💧', cola: '🥤',
    snack: '🍫', cereal: '🥣', yogurt: '🥛', candy: '🍬', cup: '☕',
    'energy drink': '⚡', pizza: '🍕', apple: '🍎', banana: '🍌',
  };
  return map[item?.toLowerCase()] || '📦';
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function CellTooltip({ item, row, col, onClose, onOverride }) {
  const style = getCellStyle(item);
  return (
    <div className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 w-44 animate-bounce-in">
      <div className="card p-3 text-center shadow-lg">
        <div className="text-2xl mb-1">{getItemEmoji(item)}</div>
        <div className="font-semibold text-navy-500 capitalize text-sm">{item === 'empty' ? 'Empty Slot' : item}</div>
        <div className="text-xs text-slate-500 mt-0.5">Row {row + 1}, Col {col + 1}</div>
        <div className="flex gap-1 mt-2">
          <button onClick={() => onOverride('empty')} className="btn-secondary btn-sm flex-1 text-xs">Clear</button>
          <button onClick={onClose} className="btn-primary btn-sm flex-1 text-xs">Close</button>
        </div>
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 bg-white border-r border-b border-surface-200 rotate-45" />
    </div>
  );
}

// ── Single Cell ───────────────────────────────────────────────────────────────
function GridCell({ item, row, col, isHighlighted, onCellClick }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const style = getCellStyle(item);
  const isEmpty = item === 'empty';

  return (
    <div
      className={`
        relative aspect-square rounded-xl border-2 cursor-pointer
        flex flex-col items-center justify-center gap-1 p-1
        transition-all duration-200 select-none
        ${isEmpty
          ? 'border-surface-300 bg-surface-100 hover:border-slate-300 hover:bg-surface-200'
          : `${style.bg} ${style.border} hover:scale-105 hover:shadow-md hover:z-10`
        }
        ${isHighlighted ? 'ring-4 ring-primary-400 ring-offset-2 scale-105' : ''}
      `}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => { setShowTooltip(true); onCellClick?.(row, col, item); }}
    >
      {!isEmpty && (
        <>
          <span className="text-lg leading-none">{getItemEmoji(item)}</span>
          <span className={`text-[9px] font-semibold capitalize leading-none ${style.text} truncate w-full text-center px-1`}>
            {item}
          </span>
          <div className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${style.dot}`} />
        </>
      )}
      {isEmpty && (
        <span className="text-slate-300 text-lg">—</span>
      )}

      {/* Tooltip */}
      {showTooltip && (
        <CellTooltip
          item={item}
          row={row}
          col={col}
          onClose={() => setShowTooltip(false)}
          onOverride={(newItem) => {
            setShowTooltip(false);
            onCellClick?.(row, col, newItem, true);
          }}
        />
      )}
    </div>
  );
}

// ── Main ShelfGrid ────────────────────────────────────────────────────────────
export default function ShelfGrid({ grid, highlightedCells = [], onCellClick, className = '' }) {
  if (!grid || grid.length === 0) {
    return (
      <div className={`flex items-center justify-center h-40 text-slate-400 ${className}`}>
        <div className="text-center">
          <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No shelf data</p>
        </div>
      </div>
    );
  }

  const rows = grid.length;
  const cols = grid[0].length;

  // Count items for legend
  const counts = {};
  grid.forEach(row => row.forEach(cell => {
    if (cell !== 'empty') counts[cell] = (counts[cell] || 0) + 1;
  }));
  const totalOccupied = Object.values(counts).reduce((a, b) => a + b, 0);
  const totalCells = rows * cols;

  return (
    <div className={className}>
      {/* Grid */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {grid.map((row, r) =>
          row.map((cell, c) => {
            const isHighlighted = highlightedCells.some(([hr, hc]) => hr === r && hc === c);
            return (
              <GridCell
                key={`${r}-${c}`}
                item={cell}
                row={r}
                col={c}
                isHighlighted={isHighlighted}
                onCellClick={onCellClick}
              />
            );
          })
        )}
      </div>

      {/* Footer stats */}
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>{totalOccupied}/{totalCells} slots filled</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded border-2 border-primary-400 bg-primary-50" />
            <span>Stocked</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded border-2 border-surface-300 bg-surface-100" />
            <span>Empty</span>
          </div>
        </div>
      </div>

      {/* Legend */}
      {Object.keys(counts).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(counts).map(([item, count]) => {
            const style = getCellStyle(item);
            return (
              <span key={item} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text} border ${style.border}`}>
                {getItemEmoji(item)} {item} ({count})
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
